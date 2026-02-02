import { Body, Controller, Get, Post, Request, Res, UseGuards, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import type { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { GoogleAuthGuard } from '@/common/guards/google-auth.guard';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { LocalAuthGuard } from '@/common/guards/local-auth.guard';
import type { JwtPayload } from './auth.service';
import { AuthService } from './auth.service';
import { type LoginPayload, loginSchema } from './dto/login.dto';
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
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 201, description: 'Returns JWT access token', type: LoginResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
  login(@Request() req: { user: User }, @Body() _payload: LoginPayload) {
    return this.authService.login(req.user);
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Redirect to Google OAuth (social login)' })
  @ApiResponse({ status: 302, description: 'Redirects to Google consent screen' })
  static googleAuth() {
    // Guard redirects to Google; no body executed
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Google OAuth callback; returns JWT or redirects to frontend' })
  @ApiResponse({
    status: 201,
    description: 'Returns OAuth code for redirect, or JWT if OAUTH_SUCCESS_REDIRECT_URL not set',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Google auth failed or not configured' })
  async googleAuthCallback(@Request() req: { user: User }, @Res() res: Response) {
    const redirectUrl = this.authService.getOAuthSuccessRedirectUrl();

    if (redirectUrl) {
      const code = await this.authService.generateOAuthCode(req.user);
      const url = new URL(redirectUrl);
      url.searchParams.set('code', code);
      return res.redirect(302, url.toString());
    }

    const payload = this.authService.login(req.user);
    return res.status(201).json(payload);
  }

  @Post('oauth/exchange')
  @UsePipes(new ZodValidationPipe(oauthExchangeSchema))
  @ApiOperation({ summary: 'Exchange OAuth code for JWT' })
  @ApiResponse({ status: 200, description: 'Returns JWT access token', type: LoginResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid or expired code' })
  async exchangeOAuthCode(@Body() payload: OauthExchangeDto) {
    return this.authService.exchangeOAuthCode(payload.code);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'Get current user from JWT' })
  @ApiResponse({ status: 200, description: 'Returns current user payload', type: MeResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized (missing or invalid token)' })
  getProfile(@CurrentUser() user: JwtPayload): JwtPayload {
    return user;
  }
}
