import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Request,
  Res,
  UnauthorizedException,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiExtraModels,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { Request as ExpressRequest, Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { GoogleAuthGuard } from '@/common/guards/google-auth.guard';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { MfaAuthGuard } from '@/common/guards/mfa-auth.guard';

import { AuthService, JwtPayload } from './auth.service';
import { ForgotPasswordDto, forgotPasswordSchema } from './dto/forgot-password.dto';
import { LoginDto, type LoginPayload, loginSchema } from './dto/login.dto';
import { LoginResponseDto, MfaRequiredResponseDto } from './dto/login-response.dto';
import { MeResponseDto } from './dto/me-response.dto';
import { MfaVerifyDto, mfaVerifySchema } from './dto/mfa-verify.dto';
import { OauthExchangeDto, oauthExchangeSchema } from './dto/oauth-exchange.dto';
import { RegisterDto, type RegisterPayload, registerSchema } from './dto/register.dto';
import { ResetPasswordDto, resetPasswordSchema } from './dto/reset-password.dto';

import {
  SelectTenantDto,
  type SelectTenantPayload,
  selectTenantSchema,
} from './dto/select-tenant.dto';
import { TenantSelectionResponseDto } from './dto/tenant-selection-response.dto';
import { getContextTenantSlug } from './oauth-context.helper';

@ApiTags('auth')
@ApiExtraModels(LoginResponseDto, TenantSelectionResponseDto)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UsePipes(new ZodValidationPipe(loginSchema))
  @HttpCode(200)
  @ApiOperation({
    summary: 'Login with email and password',
    description:
      'Validates credentials. Returns: (1) JWT when single tenant and no MFA, (2) tenant selection when user belongs to multiple tenants, or (3) MFA_REQUIRED when MFA is needed.',
  })
  @ApiBody({ type: LoginDto, description: 'Email and password' })
  @ApiResponse({
    status: 200,
    description: 'JWT access token (single tenant) or tenant selection (multi-tenant)',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(LoginResponseDto) },
        { $ref: getSchemaPath(TenantSelectionResponseDto) },
      ],
    },
  })
  @ApiResponse({ status: 202, description: 'MFA Required', type: MfaRequiredResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input (e.g. invalid email format)' })
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async login(@Body() payload: LoginPayload, @Res() res: Response, @Request() req: ExpressRequest) {
    const result = await this.authService.attemptLogin(
      payload.email,
      payload.password,
      req.ip,
      req.headers['user-agent'],
    );

    if ('message' in result && result.message === 'MFA_REQUIRED') {
      return res.status(202).json(result);
    }

    if ('tenants' in result && 'tempToken' in result) {
      return res.status(200).json(result);
    }

    return res.status(200).json(result);
  }

  @Post('select-tenant')
  @UsePipes(new ZodValidationPipe(selectTenantSchema))
  @HttpCode(200)
  @ApiOperation({
    summary: 'Select tenant and complete login',
    description:
      'Exchanges tempToken (from multi-tenant login) and selected tenantId for the final JWT. Validates that the user belongs to the chosen tenant.',
  })
  @ApiBody({
    type: SelectTenantDto,
    description: 'tempToken from login response and tenantId selected by user',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns JWT access token',
    type: LoginResponseDto,
  })
  @ApiResponse({
    status: 202,
    description: 'MFA Required for selected tenant',
    type: MfaRequiredResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input (e.g. invalid tenantId format)' })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired temp token; tenant not in user list',
  })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async selectTenant(
    @Body() payload: SelectTenantPayload,
    @Res() res: Response,
    @Request() req: ExpressRequest,
  ) {
    const result = await this.authService.selectTenant(
      payload.tempToken,
      payload.tenantId,
      req.ip,
      req.headers['user-agent'],
    );

    if ('message' in result && result.message === 'MFA_REQUIRED') {
      return res.status(202).json(result);
    }

    return res.status(200).json(result);
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({
    summary: 'Redirect to Google OAuth (social login)',
    description:
      'Accepts optional ?tenantSlug= or x-tenant-slug header for Caso 3 (auto-register in tenant).',
  })
  @ApiResponse({ status: 302, description: 'Redirects to Google consent screen' })
  @ApiResponse({ status: 401, description: 'Google OAuth not configured' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  googleAuth() {
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
  @ApiResponse({ status: 202, description: 'MFA Required', type: MfaRequiredResponseDto })
  @ApiResponse({ status: 302, description: 'Redirect to OAUTH_SUCCESS_REDIRECT_URL' })
  @ApiResponse({ status: 401, description: 'Google auth failed or not configured' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  // biome-ignore lint/suspicious/noExplicitAny: req.user from GoogleStrategy is any
  async googleAuthCallback(@Request() req: any, @Res() res: Response) {
    const result = await this.authService.processSocialProfile(
      req.user,
      'google',
      // biome-ignore lint/suspicious/noExplicitAny: req needs cast for helper
      getContextTenantSlug(req as any),
      req.ip,
      req.headers['user-agent'] as string,
    );

    const redirectUrl = this.authService.getOAuthSuccessRedirectUrl();

    if (redirectUrl) {
      const url = await this.authService.buildOAuthRedirectUrl(result);
      if (url) return res.redirect(302, url);
    }

    if ('message' in result && result.message === 'MFA_REQUIRED') {
      return res.status(202).json(result);
    }

    if ('tenants' in result && 'tempToken' in result) {
      return res.status(200).json(result);
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
  async exchangeOAuthCode(@Body() payload: OauthExchangeDto, @Request() req: ExpressRequest) {
    return this.authService.exchangeOAuthCode(payload.code, req.ip, req.headers['user-agent']);
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
  async switchTenant(
    @CurrentUser() user: JwtPayload,
    @Param('tenantId') tenantId: string,
    @Request() req: ExpressRequest,
  ) {
    return this.authService.switchTenant(user.sub, tenantId, req.ip, req.headers['user-agent']);
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
    const result = await this.authService.forgotPassword(payload.email);
    return {
      message: 'If an account with that email exists, a password reset link has been sent.',
      ...(result.originalToken ? { _debug: result.originalToken } : {}),
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
  async verifyMfa(
    @Request() req: ExpressRequest & { user: JwtPayload },
    @Body() payload: MfaVerifyDto,
  ) {
    if (!req.user || !req.user.sub) {
      throw new UnauthorizedException('User session not found');
    }
    return this.authService.verifyMfa(
      req.user.sub,
      payload.code,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Public()
  @Post('register')
  @UsePipes(new ZodValidationPipe(registerSchema))
  @HttpCode(201)
  @ApiOperation({
    summary: 'Register a new user',
    description:
      'Creates a new user. If tenantSlug matches an active tenant, joins as USER. Otherwise, creates a new Tenant and joins as ADMIN.',
  })
  @ApiBody({ type: RegisterDto, description: 'User registration data' })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully; returns JWT access token',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async register(
    @Body() payload: RegisterPayload,
    @Request() req: ExpressRequest,
  ): Promise<LoginResponseDto> {
    return (await this.authService.register(
      payload,
      req.ip,
      req.headers['user-agent'],
    )) as LoginResponseDto;
  }
}
