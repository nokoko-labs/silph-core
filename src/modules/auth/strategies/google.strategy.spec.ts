import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { AuthService } from '../auth.service';
import { GoogleStrategy } from './google.strategy';

describe('GoogleStrategy', () => {
  let strategy: GoogleStrategy;
  let authService: AuthService;

  const mockUser = {
    id: 'user-1',
    email: 'user@gmail.com',
    password: null as string | null,
    role: 'USER' as Role,
    tenantId: 'tenant-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockProfile = {
    id: 'google-sub-123',
    emails: [{ value: 'user@gmail.com', verified: true }],
    displayName: 'Test User',
  };

  const mockAuthService = {
    processSocialProfile: jest.fn().mockResolvedValue(mockUser),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'GOOGLE_CLIENT_ID') return 'client-id';
      return undefined;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    (mockAuthService.processSocialProfile as jest.Mock).mockResolvedValue(mockUser);
    (mockConfigService.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'GOOGLE_CLIENT_ID') return 'client-id';
      return undefined;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleStrategy,
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    strategy = module.get<GoogleStrategy>(GoogleStrategy);
    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    it('should return user when Google profile is valid and configured', async () => {
      const result = await strategy.validate('access', 'refresh', mockProfile);
      expect(result).toEqual(mockUser);
      expect(authService.processSocialProfile).toHaveBeenCalledWith(mockProfile, 'google');
    });

    it('should throw UnauthorizedException when Google is not configured', async () => {
      (mockConfigService.get as jest.Mock).mockReturnValue(undefined);

      await expect(strategy.validate('access', 'refresh', mockProfile)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate('access', 'refresh', mockProfile)).rejects.toThrow(
        'Google login is not configured',
      );
    });
  });
});
