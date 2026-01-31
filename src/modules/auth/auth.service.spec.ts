import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { Role, type User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { type DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { RedisService } from '@/cache/redis.service';
import { PrismaService } from '@/database/prisma.service';
import { AuthService } from './auth.service';

jest.mock('bcryptjs', () => ({
  compare: jest.fn().mockResolvedValue(true),
}));

describe('AuthService', () => {
  let service: AuthService;
  let prisma: DeepMockProxy<PrismaService>;
  let jwtService: JwtService;

  const mockUser = {
    id: 'user-uuid-1',
    email: 'admin@example.com',
    password: 'hashed-password',
    role: 'ADMIN' as Role,
    tenantId: 'tenant-uuid-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrisma = mockDeep<PrismaService>();

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string, defaultValue?: unknown) => {
      if (key === 'JWT_EXPIRES_IN') return '7d';
      if (key === 'ALLOWED_OAUTH_REDIRECT_DOMAINS') return 'example.com, localhost';
      return defaultValue;
    }),
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };

  beforeEach(async () => {
    (bcrypt.compare as jest.Mock).mockClear().mockResolvedValue(true);
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateUser', () => {
    it('should return user when email and password are valid', async () => {
      const result = await service.validateUser('admin@example.com', 'admin123');

      expect(result).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'admin@example.com' },
      });
      expect(bcrypt.compare).toHaveBeenCalledWith('admin123', mockUser.password);
    });

    it('should return null when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.validateUser('unknown@example.com', 'pass');

      expect(result).toBeNull();
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('should return null when user has no password (OAuth-only)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        password: null,
      } as User);

      const result = await service.validateUser('admin@example.com', 'any');

      expect(result).toBeNull();
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('should return null when password does not match', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validateUser('admin@example.com', 'wrong-password');

      expect(result).toBeNull();
    });
  });

  describe('login', () => {
    it('should return access_token with JWT payload', () => {
      const result = service.login(mockUser);

      expect(result).toEqual({ access_token: 'mock-jwt-token' });
      expect(jwtService.sign).toHaveBeenCalledWith(
        {
          sub: mockUser.id,
          email: mockUser.email,
          role: mockUser.role,
          tenantId: mockUser.tenantId,
        },
        { expiresIn: '7d' },
      );
    });
  });

  describe('validateRedirectUrl', () => {
    it('should return true for allowed domains', () => {
      expect(service.validateRedirectUrl('https://example.com/callback')).toBe(true);
      expect(service.validateRedirectUrl('http://localhost:3000')).toBe(true);
    });

    it('should return false for disallowed domains', () => {
      expect(service.validateRedirectUrl('https://evil.com')).toBe(false);
    });

    it('should handle wildcard domains if implemented (e.g., .example.com)', () => {
      (mockConfigService.get as jest.Mock).mockImplementation(
        (key: string, defaultValue?: unknown) => {
          if (key === 'ALLOWED_OAUTH_REDIRECT_DOMAINS') return '.example.com';
          return defaultValue;
        },
      );
      expect(service.validateRedirectUrl('https://app.example.com')).toBe(true);
    });
  });

  describe('generateOAuthCode', () => {
    it('should generate a code and store it in Redis', async () => {
      const code = await service.generateOAuthCode(mockUser);

      expect(code).toBeDefined();
      expect(mockRedisService.set).toHaveBeenCalledWith(
        expect.stringMatching(/^oauth_code:/),
        expect.any(String),
        60,
      );
    });
  });

  describe('exchangeOAuthCode', () => {
    it('should return JWT when code is valid', async () => {
      const mockCodeData = JSON.stringify({
        userId: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
        tenantId: mockUser.tenantId,
      });
      mockRedisService.get.mockResolvedValue(mockCodeData);

      const result = await service.exchangeOAuthCode('valid-code');

      expect(result).toEqual({ access_token: 'mock-jwt-token' });
      expect(mockRedisService.del).toHaveBeenCalledWith('oauth_code:valid-code');
    });

    it('should throw UnauthorizedException when code is invalid or expired', async () => {
      mockRedisService.get.mockResolvedValue(null);

      await expect(service.exchangeOAuthCode('invalid-code')).rejects.toThrow();
    });
  });
});
