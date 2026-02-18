import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { RedisService } from '@/cache/redis.service';
import { AuthService } from '../auth.service';
import { GoogleStrategy } from './google.strategy';

describe('GoogleStrategy', () => {
  let strategy: GoogleStrategy;
  let authService: AuthService;

  const mockLoginResult = { access_token: 'mock-jwt-token' };

  const mockProfile = {
    id: 'google-sub-123',
    emails: [{ value: 'user@gmail.com', verified: true }],
    displayName: 'Test User',
  };

  const mockReq = { oauthContextState: undefined as { tenantSlug?: string } | undefined };

  const mockAuthService = {
    processSocialProfile: jest.fn().mockResolvedValue(mockLoginResult),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'GOOGLE_CLIENT_ID') return 'client-id';
      return undefined;
    }),
  };

  const mockRedisService = { get: jest.fn(), set: jest.fn(), del: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockReq.oauthContextState = undefined;
    (mockAuthService.processSocialProfile as jest.Mock).mockResolvedValue(mockLoginResult);
    (mockConfigService.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'GOOGLE_CLIENT_ID') return 'client-id';
      return undefined;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleStrategy,
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    strategy = module.get<GoogleStrategy>(GoogleStrategy);
    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    it('should return LoginResult when Google profile is valid and configured', async () => {
      const result = await strategy.validate(mockReq, 'access', 'refresh', mockProfile);
      expect(result).toEqual(mockLoginResult);
      expect(authService.processSocialProfile).toHaveBeenCalledWith(
        mockProfile,
        'google',
        undefined,
      );
    });

    it('should pass contextTenantSlug from req.oauthContextState to processSocialProfile', async () => {
      mockReq.oauthContextState = { tenantSlug: 'acme' };
      await strategy.validate(mockReq, 'access', 'refresh', mockProfile);
      expect(authService.processSocialProfile).toHaveBeenCalledWith(mockProfile, 'google', 'acme');
    });

    it('should throw UnauthorizedException when Google is not configured', async () => {
      (mockConfigService.get as jest.Mock).mockReturnValue(undefined);

      await expect(strategy.validate(mockReq, 'access', 'refresh', mockProfile)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(mockReq, 'access', 'refresh', mockProfile)).rejects.toThrow(
        'Google login is not configured',
      );
    });
  });
});
