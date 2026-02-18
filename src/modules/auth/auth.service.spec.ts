import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  type Account,
  type PasswordResetToken,
  Role,
  type Tenant,
  type User,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { type DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { RedisService } from '@/cache/redis.service';
import { PrismaService } from '@/database/prisma.service';
import { MailService } from '@/modules/mail/mail.service';
import { AuditLogService } from '../audit/audit-log.service';
import { AuthService } from './auth.service';

jest.mock('bcryptjs', () => ({
  compare: jest.fn().mockResolvedValue(true),
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

jest.mock('otplib', () => ({
  verify: jest.fn().mockReturnValue(true),
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
    verify: jest.fn().mockReturnValue({ sub: 'session-id', type: 'tenant_selection' }),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string, defaultValue?: unknown) => {
      if (key === 'JWT_EXPIRES_IN') return '7d';
      if (key === 'ALLOWED_OAUTH_REDIRECT_DOMAINS') return 'example.com, localhost';
      return defaultValue;
    }),
    getOrThrow: jest.fn().mockImplementation((key: string) => {
      if (key === 'OAUTH_DEFAULT_TENANT_ID') return 'tenant-uuid-1';
      throw new Error(`Config key ${key} not found`);
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

  const mockAuditLogService = {
    create: jest.fn().mockResolvedValue({}),
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
        { provide: AuditLogService, useValue: mockAuditLogService },
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
        include: { tenant: true, accounts: true },
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

  describe('processSocialProfile', () => {
    const profile = {
      id: 'social-id',
      emails: [{ value: 'test@example.com', verified: true }],
      displayName: 'Test User',
    };

    const mockTenant = {
      id: 'tenant-uuid-1',
      name: 'Test Tenant',
      slug: 'test-tenant',
      status: 'ACTIVE',
      enabledAuthProviders: ['google', 'github'],
      deletedAt: null,
    };

    beforeEach(() => {
      mockPrisma.tenant.findUnique.mockResolvedValue(mockTenant as unknown as Tenant);
      mockPrisma.tenant.findFirst.mockResolvedValue(mockTenant as unknown as Tenant);
      (mockConfigService.get as jest.Mock).mockImplementation(
        (key: string, defaultValue?: unknown) => {
          if (key === 'OAUTH_DEFAULT_TENANT_ID') return 'tenant-uuid-1';
          if (key === 'JWT_EXPIRES_IN') return '7d';
          if (key === 'ALLOWED_OAUTH_REDIRECT_DOMAINS') return 'example.com, localhost';
          return defaultValue;
        },
      );
      (mockConfigService.getOrThrow as jest.Mock).mockImplementation((key: string) => {
        if (key === 'OAUTH_DEFAULT_TENANT_ID') return 'tenant-uuid-1';
        throw new Error(`Config key ${key} not found`);
      });
    });

    it('should throw BadRequestException if profile has no email', async () => {
      await expect(service.processSocialProfile({ id: 'id' }, 'google')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw UnauthorizedException if email is not verified', async () => {
      const unverifiedProfile = {
        ...profile,
        emails: [{ value: 'test@example.com', verified: false }],
      };
      await expect(service.processSocialProfile(unverifiedProfile, 'google')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return JWT when account already exists and user is ACTIVE', async () => {
      mockPrisma.account.findMany.mockResolvedValue([
        {
          user: { ...mockUser, status: 'ACTIVE', tenant: mockTenant },
        },
      ] as unknown as Account[]);

      const result = await service.processSocialProfile(profile, 'google');
      expect(result).toEqual({ access_token: 'mock-jwt-token' });
      expect(mockPrisma.account.findMany).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if provider is not enabled for tenant', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.tenant.findFirst.mockResolvedValue({
        ...mockTenant,
        enabledAuthProviders: ['password'], // google not here
      } as unknown as Tenant);

      await expect(service.processSocialProfile(profile, 'google', 'test-tenant')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should link to existing user if email matches and return JWT', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([
        { ...mockUser, status: 'ACTIVE', tenant: mockTenant, accounts: [] },
      ] as unknown as User[]);
      mockPrisma.account.create.mockResolvedValue({} as unknown as Account);

      const result = await service.processSocialProfile(profile, 'google');
      expect(result).toEqual({ access_token: 'mock-jwt-token' });
      expect(mockPrisma.account.create).toHaveBeenCalledWith({
        data: {
          userId: mockUser.id,
          provider: 'google',
          providerAccountId: profile.id,
        },
      });
    });

    it('should create new user and account if none exist when contextTenantSlug provided', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.tenant.findFirst.mockResolvedValue(mockTenant as unknown as Tenant);
      mockPrisma.user.create.mockResolvedValue({
        ...mockUser,
        id: 'new-user-id',
        email: profile.emails[0].value,
      } as unknown as User);

      const result = await service.processSocialProfile(profile, 'google', 'test-tenant');
      expect(result).toEqual({ access_token: 'mock-jwt-token' });
      expect(mockPrisma.user.create).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when new user and no contextTenantSlug', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      await expect(service.processSocialProfile(profile, 'google')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.processSocialProfile(profile, 'google')).rejects.toThrow(
        'Sign up requires a tenant context',
      );
    });

    it('should throw UnauthorizedException if user account is SUSPENDED', async () => {
      mockPrisma.account.findMany.mockResolvedValue([
        {
          user: { ...mockUser, status: 'SUSPENDED', tenant: mockTenant },
        },
      ] as unknown as Account[]);

      await expect(service.processSocialProfile(profile, 'google')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw NotFoundException when contextTenantSlug does not exist', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.tenant.findFirst.mockResolvedValue(null);

      await expect(
        service.processSocialProfile(profile, 'google', 'non-existent-tenant'),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.processSocialProfile(profile, 'google', 'non-existent-tenant'),
      ).rejects.toThrow('Tenant with slug "non-existent-tenant" not found');
    });

    it('should throw UnauthorizedException when email is linked to different provider account', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([
        {
          ...mockUser,
          status: 'ACTIVE',
          tenant: mockTenant,
          accounts: [{ provider: 'google', providerAccountId: 'other-google-sub' }],
        },
      ] as unknown as User[]);

      await expect(service.processSocialProfile(profile, 'google')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should link to multiple users and return tenant selection when email exists in multiple tenants', async () => {
      const tenant1 = { ...mockTenant, name: 'Tenant A', slug: 'tenant-a' };
      const tenant2 = {
        id: 'tenant-uuid-2',
        name: 'Tenant B',
        slug: 'tenant-b',
        status: 'ACTIVE',
        deletedAt: null,
      };
      const user2 = {
        ...mockUser,
        id: 'user-uuid-2',
        tenantId: 'tenant-uuid-2',
        tenant: tenant2,
        accounts: [] as unknown[],
      };
      mockPrisma.account.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([
        { ...mockUser, status: 'ACTIVE', tenant: tenant1, accounts: [] },
        user2,
      ] as unknown as User[]);
      mockPrisma.account.createMany.mockResolvedValue({ count: 2 });

      const result = await service.processSocialProfile(profile, 'google');

      expect(result).toMatchObject({
        tenants: expect.arrayContaining([
          expect.objectContaining({ id: 'tenant-uuid-1', name: 'Tenant A', slug: 'tenant-a' }),
          expect.objectContaining({ id: 'tenant-uuid-2', name: 'Tenant B', slug: 'tenant-b' }),
        ]),
        tempToken: 'mock-jwt-token',
      });
      expect(mockPrisma.account.createMany).toHaveBeenCalledWith({
        data: [
          { userId: mockUser.id, provider: 'google', providerAccountId: profile.id },
          { userId: user2.id, provider: 'google', providerAccountId: profile.id },
        ],
        skipDuplicates: true,
      });
    });
  });

  describe('attemptLogin', () => {
    beforeEach(() => {
      mockPrisma.user.findMany.mockResolvedValue([mockUser] as unknown as User[]);
    });

    it('should throw UnauthorizedException when credentials are invalid', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.attemptLogin('unknown@example.com', 'wrong')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return JWT when single tenant and no MFA', async () => {
      const result = await service.attemptLogin('admin@example.com', 'admin123');

      expect(result).toEqual({ access_token: 'mock-jwt-token' });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ email: 'admin@example.com' }),
        }),
      );
    });

    it('should return tenant selection when user has multiple tenants', async () => {
      const user2 = {
        ...mockUser,
        id: 'user-uuid-2',
        tenantId: 'tenant-uuid-2',
        tenant: {
          id: 'tenant-uuid-2',
          name: 'Tenant B',
          slug: 'tenant-b',
          status: 'ACTIVE',
          deletedAt: null,
        },
      };
      mockPrisma.user.findMany.mockResolvedValue([
        { ...mockUser, tenant: { ...mockUser.tenant, name: 'Tenant A', slug: 'tenant-a' } },
        user2,
      ] as unknown as User[]);

      const result = await service.attemptLogin('admin@example.com', 'admin123');

      expect(result).toMatchObject({
        tenants: expect.arrayContaining([
          expect.objectContaining({ id: 'tenant-uuid-1', name: 'Tenant A', slug: 'tenant-a' }),
          expect.objectContaining({ id: 'tenant-uuid-2', name: 'Tenant B', slug: 'tenant-b' }),
        ]),
        tempToken: 'mock-jwt-token',
      });
      expect(mockRedisService.set).toHaveBeenCalledWith(
        expect.stringMatching(/^tenant_selection:/),
        expect.any(String),
        300,
      );
    });
  });

  describe('selectTenant', () => {
    it('should return JWT when tempToken and tenantId are valid', async () => {
      const sessionId = 'session-uuid';
      const tenantUsers = [{ userId: mockUser.id, tenantId: mockUser.tenantId }];
      (mockJwtService.verify as jest.Mock).mockReturnValue({
        sub: sessionId,
        type: 'tenant_selection',
      });
      mockRedisService.get.mockResolvedValue(JSON.stringify(tenantUsers));
      mockPrisma.user.findFirst.mockResolvedValue(mockUser as unknown as User);

      const result = await service.selectTenant('valid-temp-token', mockUser.tenantId);

      expect(result).toEqual({ access_token: 'mock-jwt-token' });
      expect(mockRedisService.del).toHaveBeenCalledWith(`tenant_selection:${sessionId}`);
    });

    it('should throw UnauthorizedException when tempToken is invalid', async () => {
      (mockJwtService.verify as jest.Mock).mockImplementation(() => {
        throw new Error('invalid');
      });

      await expect(service.selectTenant('invalid-token', 'tenant-uuid-1')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when tenantId not in session', async () => {
      (mockJwtService.verify as jest.Mock).mockReturnValue({
        sub: 'session-uuid',
        type: 'tenant_selection',
      });
      mockRedisService.get.mockResolvedValue(
        JSON.stringify([{ userId: mockUser.id, tenantId: mockUser.tenantId }]),
      );

      await expect(service.selectTenant('valid-token', 'other-tenant-uuid')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when session expired', async () => {
      (mockJwtService.verify as jest.Mock).mockReturnValue({
        sub: 'session-uuid',
        type: 'tenant_selection',
      });
      mockRedisService.get.mockResolvedValue(null);

      await expect(service.selectTenant('valid-token', mockUser.tenantId)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('login', () => {
    it('should return access_token with JWT payload', async () => {
      const result = await service.login(mockUser);

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

  describe('buildOAuthRedirectUrl', () => {
    beforeEach(() => {
      (mockConfigService.get as jest.Mock).mockImplementation(
        (key: string, defaultValue?: unknown) => {
          if (key === 'OAUTH_SUCCESS_REDIRECT_URL') return 'https://app.example.com/callback';
          if (key === 'ALLOWED_OAUTH_REDIRECT_DOMAINS')
            return 'https://app.example.com, app.example.com';
          if (key === 'JWT_EXPIRES_IN') return '7d';
          if (key === 'OAUTH_CODE_EXPIRES_IN') return 60;
          return defaultValue;
        },
      );
    });

    it('should build URL with code when JWT result and redirect is configured', async () => {
      const loginResult = { access_token: 'mock-jwt-token' };

      const url = await service.buildOAuthRedirectUrl(loginResult);

      expect(url).toContain('https://app.example.com/callback');
      expect(url).toContain('code=');
      expect(mockRedisService.set).toHaveBeenCalledWith(
        expect.stringMatching(/^oauth_code:/),
        JSON.stringify(loginResult),
        60,
      );
    });

    it('should build URL with tempToken when tenant selection result', async () => {
      const loginResult = {
        tenants: [{ id: 't1', name: 'Tenant 1', slug: 't1' }],
        tempToken: 'temp-token-123',
      };

      const url = await service.buildOAuthRedirectUrl(loginResult);

      expect(url).toContain('tempToken=temp-token-123');
      expect(url).toContain('tenants=');
    });
  });

  describe('exchangeOAuthCode', () => {
    it('should return JWT when code stores direct JWT result', async () => {
      const mockCodeData = JSON.stringify({ access_token: 'stored-jwt-token' });
      mockRedisService.get.mockResolvedValue(mockCodeData);

      const result = await service.exchangeOAuthCode('valid-code');

      expect(result).toEqual({ access_token: 'stored-jwt-token' });
      expect(mockRedisService.del).toHaveBeenCalledWith('oauth_code:valid-code');
    });

    it('should return JWT when code stores legacy user payload', async () => {
      const mockCodeData = JSON.stringify({
        userId: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
        tenantId: mockUser.tenantId,
        status: mockUser.status,
      });
      mockRedisService.get.mockResolvedValue(mockCodeData);
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        tenant: mockUser.tenant,
      } as unknown as User);

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
      mockPrisma.passwordResetToken.create.mockResolvedValue({} as unknown as PasswordResetToken);

      const result = await service.forgotPassword('admin@example.com');

      expect(result).toHaveProperty('originalToken');
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
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue(
        mockResetToken as unknown as PasswordResetToken,
      );
      mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.$transaction.mockImplementation(
        async (cb: (prisma: unknown) => Promise<unknown>) => await cb(mockPrisma),
      );

      await service.resetPassword('raw-token', 'new-password123');

      expect(mockPrisma.user.updateMany).toHaveBeenCalled();
      expect(mockPrisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { user: { email: mockUser.email } },
      });
      expect(mockAuditLogService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PASSWORD_RESET_MASSIVE',
          entity: 'User',
          entityId: mockUser.email,
        }),
      );
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
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue(
        mockResetToken as unknown as PasswordResetToken,
      );
      mockPrisma.passwordResetToken.delete.mockResolvedValue({} as unknown as PasswordResetToken);

      await expect(service.resetPassword('token', 'pass')).rejects.toThrow();
      expect(prisma.passwordResetToken.delete).toHaveBeenCalledWith({
        where: { id: 'token-uuid' },
      });
    });
  });

  describe('MFA Validation', () => {
    it('should return MFA_REQUIRED if tenant requires MFA', async () => {
      const userWithMfaTenant = {
        ...mockUser,
        tenant: { ...mockUser.tenant, mfaRequired: true },
      };

      const result = await service.login(userWithMfaTenant as unknown as User);

      expect(result).toMatchObject({
        message: 'MFA_REQUIRED',
        mfaToken: expect.any(String),
      });
    });

    it('should return MFA_REQUIRED if user has mfaEnabled', async () => {
      const userWithMfaEnabled = {
        ...mockUser,
        mfaEnabled: true,
      };

      const result = await service.login(userWithMfaEnabled as unknown as User);

      expect(result).toMatchObject({
        message: 'MFA_REQUIRED',
        mfaToken: expect.any(String),
      });
    });

    it('should verify MFA code and return tokens', async () => {
      const userWithSecret = { ...mockUser, mfaSecret: 'JBSWY3DPEHPK3PXP' };
      prisma.user.findUnique.mockResolvedValue(userWithSecret as unknown as User);
      mockRedisService.get.mockResolvedValue(null);
      (require('otplib').verify as jest.Mock).mockReturnValue(true);

      const result = await service.verifyMfa(mockUser.id, '123456');

      expect(result).toEqual({ access_token: 'mock-jwt-token' });
      expect(mockRedisService.del).toHaveBeenCalledWith(`mfa_attempts:${mockUser.id}`);
    });

    it('should throw UnauthorizedException on invalid MFA code', async () => {
      const userWithSecret = { ...mockUser, mfaSecret: 'JBSWY3DPEHPK3PXP' };
      prisma.user.findUnique.mockResolvedValue(userWithSecret as unknown as User);
      mockRedisService.get.mockResolvedValue('0');
      (require('otplib').verify as jest.Mock).mockReturnValue(false);

      await expect(service.verifyMfa(mockUser.id, '111111')).rejects.toThrow(UnauthorizedException);
      expect(mockRedisService.set).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if too many attempts', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        mfaSecret: 'secret',
      } as unknown as User);
      mockRedisService.get.mockResolvedValue('5');

      await expect(service.verifyMfa(mockUser.id, '123456')).rejects.toThrow('Too many attempts');
    });
  });
});
