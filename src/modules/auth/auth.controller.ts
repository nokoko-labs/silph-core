import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Request,
  Res,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { GoogleAuthGuard } from '@/common/guards/google-auth.guard';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { LocalAuthGuard } from '@/common/guards/local-auth.guard';
import { MfaAuthGuard } from '@/common/guards/mfa-auth.guard';
import { AuthService, JwtPayload } from './auth.service';
import { ForgotPasswordDto, forgotPasswordSchema } from './dto/forgot-password.dto';
import { LoginDto, type LoginPayload, loginSchema } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { MeResponseDto } from './dto/me-response.dto';
import { MfaVerifyDto, mfaVerifySchema } from './dto/mfa-verify.dto';
import { OauthExchangeDto, oauthExchangeSchema } from './dto/oauth-exchange.dto';
import { ResetPasswordDto, resetPasswordSchema } from './dto/reset-password.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UsePipes(new ZodValidationPipe(loginSchema))
  @UseGuards(LocalAuthGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({ type: LoginDto, description: 'Email and password' })
  @ApiResponse({ status: 200, description: 'Returns JWT access token', type: LoginResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input (e.g. invalid email format)' })
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async login(
    @Request() req: { user: User },
    @Body() _payload: LoginPayload,
    @Res() res: Response,
  ) {
    const result = await this.authService.login(req.user);

    if ('message' in result && result.message === 'MFA_REQUIRED') {
      return res.status(202).json(result);
    }

    return res.status(200).json(result);
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Redirect to Google OAuth (social login)' })
  @ApiResponse({ status: 302, description: 'Redirects to Google consent screen' })
  @ApiResponse({ status: 401, description: 'Google OAuth not configured' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  static googleAuth() {
    // Guard redirects to Google; no body executed
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Google OAuth callback; returns JWT or redirects to frontend' })
  @ApiResponse({
    status: 200,
    description: 'Returns JWT if OAUTH_SUCCESS_REDIRECT_URL not set',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 302, description: 'Redirect to OAUTH_SUCCESS_REDIRECT_URL' })
  @ApiResponse({ status: 401, description: 'Google auth failed or not configured' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async googleAuthCallback(@Request() req: { user: User }, @Res() res: Response) {
    const redirectUrl = this.authService.getOAuthSuccessRedirectUrl();

    if (redirectUrl) {
      const code = await this.authService.generateOAuthCode(req.user);
      const url = new URL(redirectUrl);
      url.searchParams.set('code', code);
      return res.redirect(302, url.toString());
    }

    const result = await this.authService.login(req.user);

    if ('message' in result && result.message === 'MFA_REQUIRED') {
      // For Google callback with redirect, we might need to handle MFA differently
      // but for now we follow the same JSON logic if no redirect, or we could redirect to an MFA page.
      // If redirectUrl is active, the frontend will get the code and exchange it.
      // We should update exchangeOAuthCode to also return MFA_REQUIRED if needed.
      return res.status(202).json(result);
    }

    return res.status(200).json(result);
  }

  @Post('oauth/exchange')
  @UsePipes(new ZodValidationPipe(oauthExchangeSchema))
  @ApiOperation({ summary: 'Exchange OAuth code for JWT' })
  @ApiBody({ type: OauthExchangeDto, description: 'OAuth code from callback redirect' })
  @ApiResponse({ status: 200, description: 'Returns JWT access token', type: LoginResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input (e.g. missing or empty code)' })
  @ApiResponse({ status: 401, description: 'Invalid or expired code' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async exchangeOAuthCode(@Body() payload: OauthExchangeDto) {
    return this.authService.exchangeOAuthCode(payload.code);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'Get current user from JWT' })
  @ApiResponse({ status: 200, description: 'Returns current user payload', type: MeResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized (missing or invalid token)' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  getProfile(@CurrentUser() user: JwtPayload): JwtPayload {
    return user;
  }

  @Post('switch-tenant/:tenantId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'Switch current tenant context' })
  @ApiResponse({
    status: 200,
    description: 'Returns new JWT for the target tenant',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized or access to target tenant denied' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async switchTenant(@CurrentUser() user: JwtPayload, @Param('tenantId') tenantId: string) {
    return this.authService.switchTenant(user.sub, tenantId);
  }

  @Post('forgot-password')
  @UsePipes(new ZodValidationPipe(forgotPasswordSchema))
  @HttpCode(200)
  @ApiOperation({ summary: 'Request password reset email' })
  @ApiBody({ type: ForgotPasswordDto, description: 'User email' })
  @ApiResponse({ status: 200, description: 'Email sent message' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async forgotPassword(@Body() payload: ForgotPasswordDto) {
    await this.authService.forgotPassword(payload.email);
    return {
      message: 'If an account with that email exists, a password reset link has been sent.',
    };
  }

  @Post('reset-password')
  @UsePipes(new ZodValidationPipe(resetPasswordSchema))
  @HttpCode(200)
  @ApiOperation({ summary: 'Reset password using token' })
  @ApiBody({ type: ResetPasswordDto, description: 'Token and new password' })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async resetPassword(@Body() payload: ResetPasswordDto) {
    await this.authService.resetPassword(payload.token, payload.newPassword);
    return { message: 'Password has been successfully updated.' };
  }

  @Post('mfa/verify')
  @UseGuards(MfaAuthGuard)
  @UsePipes(new ZodValidationPipe(mfaVerifySchema))
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify MFA code' })
  @ApiBody({ type: MfaVerifyDto, description: 'MFA token and 6-digit code' })
  @ApiResponse({ status: 200, description: 'Returns final JWT tokens', type: LoginResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid MFA code or too many attempts' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async verifyMfa(@Request() req: { user: { userId: string } }, @Body() payload: MfaVerifyDto) {
    return this.authService.verifyMfa(req.user.userId, payload.code);
  }
}
