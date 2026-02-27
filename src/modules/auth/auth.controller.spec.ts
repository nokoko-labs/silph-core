import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginPayload } from './dto/login.dto';

describe('AuthController', () => {
  let controller: AuthController;
  let service: AuthService;

  const mockUser = {
    id: 'user-uuid-1',
    email: 'admin@example.com',
    password: 'hashed-password',
    role: 'ADMIN' as Role,
    tenantId: 'tenant-uuid-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockReq = {
    ip: '127.0.0.1',
    headers: { 'user-agent': 'jest-test' },
  };

  const mockJwtPayload = {
    sub: mockUser.id,
    email: mockUser.email,
    role: mockUser.role,
    tenantId: mockUser.tenantId,
  };

  const mockJwtResponse = { access_token: 'mock-jwt-token', tenantSlug: 'acme' };
  const mockAuthService = {
    attemptLogin: jest.fn().mockResolvedValue(mockJwtResponse),
    getOAuthSuccessRedirectUrl: jest.fn(),
    getFrontendOAuthRedirectBaseUrl: jest.fn(),
    buildFrontendAuthCallbackUrl: jest.fn(),
    buildFrontendRedirectUrl: jest.fn(),
    buildOAuthRedirectUrl: jest
      .fn()
      .mockResolvedValue('http://localhost:3000/?code=mock-oauth-code'),
    exchangeOAuthCode: jest.fn().mockResolvedValue(mockJwtResponse),
    login: jest.fn().mockResolvedValue(mockJwtResponse),
    selectTenant: jest.fn().mockResolvedValue(mockJwtResponse),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('should return JSON with access_token when login is successful (single tenant)', async () => {
      const loginPayload: LoginPayload = { email: 'admin@example.com', password: 'admin123' };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as unknown as Response;

      await controller.login(loginPayload, res, mockReq as any);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ access_token: 'mock-jwt-token', tenantSlug: 'acme' });
      expect(service.attemptLogin).toHaveBeenCalledWith(
        loginPayload.email,
        loginPayload.password,
        undefined,
        undefined,
        mockReq.ip,
        mockReq.headers['user-agent'],
      );
    });

    it('should return 202 with MFA_REQUIRED when MFA is needed', async () => {
      mockAuthService.attemptLogin.mockResolvedValueOnce({
        message: 'MFA_REQUIRED',
        mfaToken: 'mfa-temp-token',
      });
      const loginPayload: LoginPayload = { email: 'admin@example.com', password: 'admin123' };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as unknown as Response;

      await controller.login(loginPayload, res, mockReq as any);

      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith({
        message: 'MFA_REQUIRED',
        mfaToken: 'mfa-temp-token',
      });
    });

    it('should return tenant selection when user has multiple tenants', async () => {
      mockAuthService.attemptLogin.mockResolvedValueOnce({
        access_token: 'selection-jwt-token',
        needsSelection: true,
        tenants: [
          { id: 't1', name: 'Tenant A', slug: 'tenant-a' },
          { id: 't2', name: 'Tenant B', slug: 'tenant-b' },
        ],
      });
      const loginPayload: LoginPayload = { email: 'user@example.com', password: 'pass' };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as unknown as Response;

      await controller.login(loginPayload, res, mockReq as any);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        access_token: 'selection-jwt-token',
        needsSelection: true,
        tenants: [
          { id: 't1', name: 'Tenant A', slug: 'tenant-a' },
          { id: 't2', name: 'Tenant B', slug: 'tenant-b' },
        ],
      });
    });
  });

  describe('selectTenant', () => {
    it('should return JWT when selection token and tenantId are valid', async () => {
      const payload = { tempToken: 'valid-selection-token', tenantId: 'tenant-uuid-1' };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as unknown as Response;

      await controller.selectTenant(payload, res, mockReq as any);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ access_token: 'mock-jwt-token', tenantSlug: 'acme' });
      expect(service.selectTenant).toHaveBeenCalledWith(
        payload.tempToken,
        payload.tenantId,
        mockReq.ip,
        mockReq.headers['user-agent'],
      );
    });

    it('should return 202 when MFA is required for selected tenant', async () => {
      mockAuthService.selectTenant.mockResolvedValueOnce({
        message: 'MFA_REQUIRED',
        mfaToken: 'mfa-temp-token',
      });
      const payload = { tempToken: 'valid-temp-token', tenantId: 'tenant-uuid-1' };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as unknown as Response;

      await controller.selectTenant(payload, res, mockReq as any);

      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith({
        message: 'MFA_REQUIRED',
        mfaToken: 'mfa-temp-token',
      });
    });
  });

  describe('getProfile', () => {
    it('should return current user payload from JWT', () => {
      const result = controller.getProfile(mockJwtPayload);

      expect(result).toEqual(mockJwtPayload);
    });
  });

  describe('googleAuthCallback', () => {
    it('should redirect via buildFrontendRedirectUrl when frontend base is set', async () => {
      mockAuthService.getFrontendOAuthRedirectBaseUrl.mockReturnValue('http://localhost:3001');
      mockAuthService.buildFrontendRedirectUrl.mockResolvedValue(
        'http://localhost:3001/acme/dashboard?token=mock-jwt-token',
      );
      const loginResult = { access_token: 'mock-jwt-token', tenantSlug: 'acme' };
      const req = { user: loginResult, oauthContextState: { tenantSlug: 'acme' } };
      const res = { redirect: jest.fn() } as unknown as Response;

      await controller.googleAuthCallback(req, res);

      expect(mockAuthService.buildFrontendRedirectUrl).toHaveBeenCalledWith(loginResult);
      expect(res.redirect).toHaveBeenCalledWith(
        302,
        'http://localhost:3001/acme/dashboard?token=mock-jwt-token',
      );
    });

    it('should redirect with code when redirectUrl is configured, no frontend base, but tenant slug in state', async () => {
      mockAuthService.getFrontendOAuthRedirectBaseUrl.mockReturnValue(undefined);
      mockAuthService.getOAuthSuccessRedirectUrl.mockReturnValue('http://localhost:3000');
      mockAuthService.buildOAuthRedirectUrl.mockResolvedValue(
        'http://localhost:3000/?code=mock-oauth-code',
      );
      const loginResult = { access_token: 'mock-jwt-token', tenantSlug: 'acme' };
      const req = { user: loginResult, oauthContextState: { tenantSlug: 'acme' } };
      const res = { redirect: jest.fn() } as unknown as Response;

      await controller.googleAuthCallback(req, res);

      expect(res.redirect).toHaveBeenCalledWith(302, 'http://localhost:3000/?code=mock-oauth-code');
      expect(mockAuthService.buildOAuthRedirectUrl).toHaveBeenCalledWith(loginResult);
    });

    it('should return JSON when redirectUrl is not configured (valid tenant slug in state)', async () => {
      mockAuthService.getFrontendOAuthRedirectBaseUrl.mockReturnValue(undefined);
      mockAuthService.getOAuthSuccessRedirectUrl.mockReturnValue(undefined);
      const loginResult = { access_token: 'mock-jwt-token', tenantSlug: 'acme' };
      const req = { user: loginResult, oauthContextState: { tenantSlug: 'acme' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as unknown as Response;

      await controller.googleAuthCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(loginResult);
    });
  });

  describe('exchangeOAuthCode', () => {
    it('should exchange code for JWT', async () => {
      const payload = { code: 'some-code' };

      const result = await controller.exchangeOAuthCode(payload, mockReq as any);

      expect(result).toEqual({ access_token: 'mock-jwt-token', tenantSlug: 'acme' });
      expect(mockAuthService.exchangeOAuthCode).toHaveBeenCalledWith(
        'some-code',
        mockReq.ip,
        mockReq.headers['user-agent'],
      );
    });
  });
});
