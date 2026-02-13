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

  const mockJwtPayload = {
    sub: mockUser.id,
    email: mockUser.email,
    role: mockUser.role,
    tenantId: mockUser.tenantId,
  };

  const mockAuthService = {
    login: jest.fn().mockReturnValue({ access_token: 'mock-jwt-token' }),
    getOAuthSuccessRedirectUrl: jest.fn(),
    generateOAuthCode: jest.fn().mockResolvedValue('mock-oauth-code'),
    exchangeOAuthCode: jest.fn().mockResolvedValue({ access_token: 'mock-jwt-token' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
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
    it('should return access_token when user is attached by LocalAuthGuard', () => {
      const req = { user: mockUser };
      const loginPayload: LoginPayload = { email: 'admin@example.com', password: 'admin123' };

      const result = controller.login(req, loginPayload);

      expect(result).toEqual({ access_token: 'mock-jwt-token' });
      expect(service.login).toHaveBeenCalledWith(mockUser);
    });
  });

  describe('getProfile', () => {
    it('should return current user payload from JWT', () => {
      const result = controller.getProfile(mockJwtPayload);

      expect(result).toEqual(mockJwtPayload);
    });
  });

  describe('googleAuthCallback', () => {
    it('should redirect with code when redirectUrl is configured', async () => {
      mockAuthService.getOAuthSuccessRedirectUrl.mockReturnValue('http://localhost:3000');
      const req = { user: mockUser };
      const res = {
        redirect: jest.fn(),
      } as unknown as Response;

      await controller.googleAuthCallback(req, res);

      expect(res.redirect).toHaveBeenCalledWith(302, 'http://localhost:3000/?code=mock-oauth-code');
      expect(mockAuthService.generateOAuthCode).toHaveBeenCalledWith(mockUser);
    });

    it('should return JSON when redirectUrl is not configured', async () => {
      mockAuthService.getOAuthSuccessRedirectUrl.mockReturnValue(undefined);
      const req = { user: mockUser };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as unknown as Response;

      await controller.googleAuthCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ access_token: 'mock-jwt-token' });
    });
  });

  describe('exchangeOAuthCode', () => {
    it('should exchange code for JWT', async () => {
      const payload = { code: 'some-code' };

      const result = await controller.exchangeOAuthCode(payload);

      expect(result).toEqual({ access_token: 'mock-jwt-token' });
      expect(mockAuthService.exchangeOAuthCode).toHaveBeenCalledWith('some-code');
    });
  });
});
