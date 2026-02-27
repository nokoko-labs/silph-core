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
  UseFilters,
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
import { GitHubAuthGuard } from '@/common/guards/github-auth.guard';
import { GoogleAuthGuard } from '@/common/guards/google-auth.guard';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { MfaAuthGuard } from '@/common/guards/mfa-auth.guard';
import type { LoginResult } from './auth.service';
import { AuthService, JwtPayload } from './auth.service';
import { ForgotPasswordDto, forgotPasswordSchema } from './dto/forgot-password.dto';
import { LoginDto, loginSchema } from './dto/login.dto';
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
import { OAuthCallbackExceptionFilter } from './filters/oauth-callback.exception-filter';

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
      'Validates credentials. With optional tenantSlug (Direct Tenant Login): resolves tenant by slug, finds user by email+tenant, validates password and ACTIVE status, then returns JWT or MFA. Without tenantSlug: returns (1) JWT when single tenant and no MFA, (2) tenant selection when user belongs to multiple tenants, or (3) MFA_REQUIRED when MFA is needed.',
  })
  @ApiBody({
    type: LoginDto,
    description: 'Email, password, and optional tenantSlug for direct tenant login',
  })
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
  async login(@Body() payload: LoginDto, @Res() res: Response, @Request() req: ExpressRequest) {
    const result = await this.authService.attemptLogin(
      String(payload.email),
      String(payload.password),
      payload.tenantSlug == null ? undefined : String(payload.tenantSlug),
      payload.tenantId == null ? undefined : String(payload.tenantId),
      req.ip,
      req.headers['user-agent'] as string | undefined,
    );

    if ('message' in result && result.message === 'MFA_REQUIRED') {
      return res.status(202).json(result);
    }

    if ('tenants' in result && 'needsSelection' in result && result.needsSelection) {
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
      'Exchanges selection token (access_token from multi-tenant login) and selected tenantId for the final JWT. Also accepts legacy tempToken. Validates that the user belongs to the chosen tenant.',
  })
  @ApiBody({
    type: SelectTenantDto,
    description:
      'Selection token (access_token) or legacy tempToken from login, and tenantId selected by user',
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
    description: 'Invalid or expired token; tenant not in user list',
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
      'Accepts optional ?slug= or ?tenantSlug= or x-tenant-slug header. Slug is passed via state to callback for direct-tenant login.',
  })
  @ApiResponse({ status: 302, description: 'Redirects to Google consent screen' })
  @ApiResponse({ status: 401, description: 'Google OAuth not configured' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  googleAuth() {
    // Guard redirects to Google; no body executed
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @UseFilters(OAuthCallbackExceptionFilter)
  @HttpCode(200)
  @ApiOperation({ summary: 'Google OAuth callback; returns JWT or redirects to frontend' })
  @ApiResponse({
    status: 200,
    description: 'Returns JWT if OAUTH_SUCCESS_REDIRECT_URL not set',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 202, description: 'MFA Required', type: MfaRequiredResponseDto })
  @ApiResponse({
    status: 302,
    description: 'Redirect to OAUTH_SUCCESS_REDIRECT_URL or frontend login on error',
  })
  @ApiResponse({ status: 401, description: 'Google auth failed or not configured' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  // biome-ignore lint/suspicious/noExplicitAny: req.user is LoginResult from strategy, req.oauthContextState from state store
  async googleAuthCallback(@Request() req: any, @Res() res: Response): Promise<Response> {
    const result = req.user as LoginResult;
    const tenantSlug = req.oauthContextState?.tenantSlug;
    return this.handleOAuthCallback(result, res, tenantSlug) as Promise<Response>;
  }

  @Get('github')
  @UseGuards(GitHubAuthGuard)
  @ApiOperation({
    summary: 'Redirect to GitHub OAuth (social login)',
    description:
      'Accepts optional ?slug= or ?tenantSlug= or x-tenant-slug header. Slug is passed via state to callback for direct-tenant login.',
  })
  @ApiResponse({ status: 302, description: 'Redirects to GitHub consent screen' })
  @ApiResponse({ status: 401, description: 'GitHub OAuth not configured' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  githubAuth() {
    // Guard redirects to GitHub; no body executed
  }

  @Get('github/callback')
  @UseGuards(GitHubAuthGuard)
  @UseFilters(OAuthCallbackExceptionFilter)
  @HttpCode(200)
  @ApiOperation({ summary: 'GitHub OAuth callback; returns JWT or redirects to frontend' })
  @ApiResponse({
    status: 200,
    description: 'Returns JWT if OAUTH_SUCCESS_REDIRECT_URL not set',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 202, description: 'MFA Required', type: MfaRequiredResponseDto })
  @ApiResponse({
    status: 302,
    description: 'Redirect to OAUTH_SUCCESS_REDIRECT_URL or frontend login on error',
  })
  @ApiResponse({ status: 401, description: 'GitHub auth failed or not configured' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  // biome-ignore lint/suspicious/noExplicitAny: req.user is LoginResult from strategy, req.oauthContextState from state store
  async githubAuthCallback(@Request() req: any, @Res() res: Response): Promise<Response> {
    const result = req.user as LoginResult;
    const tenantSlug = req.oauthContextState?.tenantSlug;
    return this.handleOAuthCallback(result, res, tenantSlug) as Promise<Response>;
  }

  private async handleOAuthCallback(
    result: LoginResult,
    res: Response,
    _tenantSlug?: string,
  ): Promise<Response> {
    const frontendBase = this.authService.getFrontendOAuthRedirectBaseUrl();

    // Blindaje de seguridad: Si no hay un slug válido, forzar redirección al selector
    if (!_tenantSlug || _tenantSlug === 'undefined' || _tenantSlug === 'null') {
      const base = frontendBase ?? 'http://localhost:3001';
      const token = 'access_token' in result ? result.access_token : '';
      const selectUrl = new URL('/select-tenant', base);
      if (token) selectUrl.searchParams.set('token', token);
      return res.redirect(302, selectUrl.toString()) as unknown as Response;
    }

    if (frontendBase) {
      const url = await this.authService.buildFrontendRedirectUrl(result);
      return res.redirect(302, url) as unknown as Response;
    }

    const redirectUrl = this.authService.getOAuthSuccessRedirectUrl();
    if (redirectUrl) {
      const url = await this.authService.buildOAuthRedirectUrl(result);
      if (url) return res.redirect(302, url) as unknown as Response;
    }

    return this.sendOAuthResult(result, res);
  }

  private sendOAuthResult(result: LoginResult, res: Response): Response {
    if ('message' in result && result.message === 'MFA_REQUIRED') {
      return res.status(202).json(result);
    }
    if ('tenants' in result && 'needsSelection' in result && result.needsSelection) {
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

  @Public()
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Logout (client-side)',
    description:
      'No server-side session. Client must clear the JWT and redirect to the login page using an absolute URL (e.g. FRONTEND_URL/login) to avoid redirect loops. Do not call the API or DB during redirect.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logged out; client must redirect to absolute login URL',
  })
  logout(): { message: string } {
    return { message: 'Logged out' };
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

  /** DEBUG: Endpoint temporal para verificar persistencia de membresías. Devuelve conteo real por email (sin scope de tenant). */
  @Get('test-my-tenants')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({
    summary: '[DEBUG] Count all memberships for current user email',
    description:
      'Temporary. Uses raw query to bypass tenant scope. Returns count and tenantIds for the logged-in user email.',
  })
  @ApiResponse({
    status: 200,
    description: '{ count: number, tenantIds: string[] }',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async testMyTenants(@CurrentUser() user: JwtPayload) {
    return this.authService.getMyTenantsCountForDebug(user.email);
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
  @ApiOperation({
    summary: 'Request password reset email (multi-tenant)',
    description:
      'Requires email and tenantSlug. If the user exists in that tenant, sends a reset email. Otherwise returns the same success message (no email) to avoid user enumeration. Returns 404 if the tenant does not exist.',
  })
  @ApiBody({
    type: ForgotPasswordDto,
    description: 'User email and tenant slug to identify the tenant account',
  })
  @ApiResponse({
    status: 200,
    description:
      'Always returns this message when tenant exists; email is sent only if user exists in that tenant',
  })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async forgotPassword(@Body() payload: ForgotPasswordDto) {
    const result = await this.authService.forgotPassword(
      String(payload.email),
      String(payload.tenantSlug),
    );
    return {
      message:
        'If an account with that email exists in this tenant, a password reset link has been sent.',
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
