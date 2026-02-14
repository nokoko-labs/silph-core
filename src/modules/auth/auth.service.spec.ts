import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { type Account, Role, type User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { type DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { RedisService } from '@/cache/redis.service';
import { PrismaService } from '@/database/prisma.service';
import { MailService } from '@/modules/mail/mail.service';
import { AuthService } from './auth.service';

jest.mock('bcryptjs', () => ({
  compare: jest.fn().mockResolvedValue(true),
  hash: jest.fn().mockResolvedValue('hashed-password'),
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
    status: 'ACTIVE',
    tenantId: 'tenant-uuid-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null as Date | null,
    tenant: {
      id: 'tenant-uuid-1',
      status: 'ACTIVE',
      deletedAt: null as Date | null,
    },
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

  const mockMailService = {
    sendResetPasswordEmail: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    (bcrypt.compare as jest.Mock).mockClear().mockResolvedValue(true);
    mockPrisma.user.findFirst.mockResolvedValue(mockUser);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: MailService, useValue: mockMailService },
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
    it('should return user when email and password are valid and user is ACTIVE and tenant is not deleted', async () => {
      const result = await service.validateUser('admin@example.com', 'admin123');

      expect(result).toEqual(mockUser);
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: 'admin@example.com', deletedAt: null },
        include: { tenant: true },
      });
      expect(bcrypt.compare).toHaveBeenCalledWith('admin123', mockUser.password);
    });

    it('should return null when user not found', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      const result = await service.validateUser('unknown@example.com', 'pass');

      expect(result).toBeNull();
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('should return null when user has no password (OAuth-only)', async () => {
      prisma.user.findFirst.mockResolvedValue({
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

    it('should return user when email and password are valid and user is PENDING', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        status: 'PENDING',
      } as unknown as User);

      const result = await service.validateUser('admin@example.com', 'admin123');

      expect(result).toMatchObject({ ...mockUser, status: 'PENDING' });
    });

    it('should return null when user is not ACTIVE or PENDING', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        status: 'SUSPENDED',
      } as unknown as User);

      const result = await service.validateUser('admin@example.com', 'any');

      expect(result).toBeNull();
    });

    it('should return null when user is DELETED (although findFirst should filter it)', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        status: 'DELETED',
        deletedAt: new Date(),
      } as unknown as User);

      const result = await service.validateUser('admin@example.com', 'any');

      expect(result).toBeNull();
    });

    it('should return null when user tenant is DELETED', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        tenant: {
          ...mockUser.tenant,
          deletedAt: new Date(),
        },
      } as unknown as User);

      const result = await service.validateUser('admin@example.com', 'any');

      expect(result).toBeNull();
    });
  });

  describe('findOrCreateFromGoogle', () => {
    const profile = {
      id: 'google-id',
      emails: [{ value: 'test@example.com' }],
      displayName: 'Test User',
    };

    it('should return user if account already exists and is ACTIVE', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({
        user: { ...mockUser, status: 'ACTIVE' },
      } as unknown as Account);

      const result = await service.findOrCreateFromGoogle(profile);
      expect(result.status).toBe('ACTIVE');
    });

    it('should return user if account already exists and is PENDING', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({
        user: { ...mockUser, status: 'PENDING' },
      } as unknown as Account);

      const result = await service.findOrCreateFromGoogle(profile);
      expect(result.status).toBe('PENDING');
    });

    it('should throw UnauthorizedException if account already exists but is SUSPENDED', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({
        user: { ...mockUser, status: 'SUSPENDED' },
      } as unknown as Account);

      await expect(service.findOrCreateFromGoogle(profile)).rejects.toThrow(UnauthorizedException);
    });

    it('should return existing user if email matches and user is ACTIVE', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null);
      mockPrisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        status: 'ACTIVE',
      } as unknown as User);
      mockPrisma.account.create.mockResolvedValue({} as unknown as Account);

      const result = await service.findOrCreateFromGoogle(profile);
      expect(result.status).toBe('ACTIVE');
    });

    it('should throw UnauthorizedException if existing user matches but is SUSPENDED', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null);
      mockPrisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        status: 'SUSPENDED',
      } as unknown as User);

      await expect(service.findOrCreateFromGoogle(profile)).rejects.toThrow(UnauthorizedException);
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
          status: mockUser.status,
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
        status: mockUser.status,
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

  describe('switchTenant', () => {
    it('should switch tenant and return a new token when valid', async () => {
      // 1. Current user email
      prisma.user.findUnique.mockResolvedValue({ email: 'admin@example.com' } as User);

      // 2. Target user in target tenant
      const targetUser = {
        ...mockUser,
        tenantId: 'tenant-uuid-2',
        role: 'USER',
        tenant: {
          id: 'tenant-uuid-2',
          status: 'ACTIVE',
          deletedAt: null,
        },
      };
      prisma.user.findFirst.mockResolvedValue(targetUser as unknown as User);

      const result = await service.switchTenant('user-uuid-1', 'tenant-uuid-2');

      expect(result).toEqual({ access_token: 'mock-jwt-token' });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
        select: { email: true },
      });
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          email: 'admin@example.com',
          tenantId: 'tenant-uuid-2',
          deletedAt: null,
        },
        include: { tenant: true },
      });
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: targetUser.id,
          tenantId: 'tenant-uuid-2',
          role: 'USER',
        }),
        expect.any(Object),
      );
    });

    it('should throw UnauthorizedException if current user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.switchTenant('non-existent', 'tenant-2')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if target user does not exist in target tenant', async () => {
      prisma.user.findUnique.mockResolvedValue({ email: 'admin@example.com' } as User);
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.switchTenant('user-1', 'tenant-2')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if target user is SUSPENDED', async () => {
      prisma.user.findUnique.mockResolvedValue({ email: 'admin@example.com' } as User);
      prisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        status: 'SUSPENDED',
        tenant: { status: 'ACTIVE', deletedAt: null },
      } as unknown as User);

      await expect(service.switchTenant('user-1', 'tenant-2')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if target tenant is not ACTIVE', async () => {
      prisma.user.findUnique.mockResolvedValue({ email: 'admin@example.com' } as User);
      prisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        status: 'ACTIVE',
        tenant: { status: 'PAUSED', deletedAt: null },
      } as unknown as User);

      await expect(service.switchTenant('user-1', 'tenant-2')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if target tenant is DELETED', async () => {
      prisma.user.findUnique.mockResolvedValue({ email: 'admin@example.com' } as User);
      prisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        status: 'ACTIVE',
        tenant: { status: 'DELETED', deletedAt: new Date() },
      } as unknown as User);

      await expect(service.switchTenant('user-1', 'tenant-2')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('forgotPassword', () => {
    it('should generate token, hash it, save it and send email', async () => {
      mockPrisma.passwordResetToken.create.mockResolvedValue({} as unknown as any);

      await service.forgotPassword('admin@example.com');

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: 'admin@example.com', deletedAt: null },
      });
      expect(prisma.passwordResetToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: mockUser.id,
            token: expect.any(String),
            expiresAt: expect.any(Date),
          }),
        }),
      );
      expect(mockMailService.sendResetPasswordEmail).toHaveBeenCalledWith(
        mockUser.email,
        expect.any(String),
      );
    });

    it('should throw NotFoundException if user not found', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.forgotPassword('unknown@example.com')).rejects.toThrow();
    });
  });

  describe('resetPassword', () => {
    it('should reset password and delete token if valid', async () => {
      const mockResetToken = {
        id: 'token-uuid',
        token: 'hashed-token',
        userId: mockUser.id,
        expiresAt: new Date(Date.now() + 3600000), // 1h from now
        user: mockUser,
      };
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue(mockResetToken as unknown as any);
      mockPrisma.user.update.mockResolvedValue({} as unknown as any);
      mockPrisma.passwordResetToken.delete.mockResolvedValue({} as unknown as any);

      await service.resetPassword('raw-token', 'new-password123');

      expect(prisma.user.update).toHaveBeenCalled();
      expect(prisma.passwordResetToken.delete).toHaveBeenCalledWith({
        where: { id: 'token-uuid' },
      });
    });

    it('should throw BadRequestException if token is invalid', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword('invalid', 'pass')).rejects.toThrow();
    });

    it('should throw BadRequestException and delete token if expired', async () => {
      const mockResetToken = {
        id: 'token-uuid',
        token: 'hashed-token',
        userId: mockUser.id,
        expiresAt: new Date(Date.now() - 3600000), // 1h ago
        user: mockUser,
      };
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue(mockResetToken as unknown as any);
      mockPrisma.passwordResetToken.delete.mockResolvedValue({} as unknown as any);

      await expect(service.resetPassword('token', 'pass')).rejects.toThrow();
      expect(prisma.passwordResetToken.delete).toHaveBeenCalledWith({
        where: { id: 'token-uuid' },
      });
    });
  });
});
