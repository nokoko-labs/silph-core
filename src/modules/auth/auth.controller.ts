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
import { AuthService, JwtPayload } from './auth.service';
import { LoginDto, type LoginPayload, loginSchema } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { MeResponseDto } from './dto/me-response.dto';
import { OauthExchangeDto, oauthExchangeSchema } from './dto/oauth-exchange.dto';

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
  login(@Request() req: { user: User }, @Body() _payload: LoginPayload) {
    return this.authService.login(req.user);
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

    const payload = this.authService.login(req.user);
    return res.status(200).json(payload);
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
}
