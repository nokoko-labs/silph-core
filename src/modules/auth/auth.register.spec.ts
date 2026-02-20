import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { Tenant, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { mockDeep } from 'jest-mock-extended';
import { RedisService } from '@/cache/redis.service';
import { PrismaService } from '@/database/prisma.service';
import { AuditLogService } from '@/modules/audit/audit-log.service';
import { MailService } from '@/modules/mail/mail.service';
import { AuthService } from './auth.service';

jest.mock('bcryptjs');

describe('AuthService (Registration)', () => {
  let service: AuthService;

  const mockPrisma = mockDeep<PrismaService>();
  const mockJwtService = mockDeep<JwtService>();
  const mockConfigService = mockDeep<ConfigService>();
  const mockRedisService = mockDeep<RedisService>();
  const mockMailService = mockDeep<MailService>();
  const mockAuditLogService = mockDeep<AuditLogService>();

  beforeEach(async () => {
    jest.clearAllMocks();
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
    (mockJwtService.sign as jest.Mock).mockReturnValue('mock-jwt-token');
    (mockConfigService.get as jest.Mock).mockImplementation((_key, def) => def || '7d');

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
  });

  describe('register', () => {
    const registerDto = {
      email: 'new@example.com',
      password: 'password123',
      name: 'New User',
    };

    it('should create a new tenant and an ADMIN user when no tenantSlug is provided', async () => {
      const mockTenant = {
        id: 't-1',
        name: "New User's Workspace",
        slug: 'new-user-xxx',
        status: 'ACTIVE',
      };
      const mockUser = {
        id: 'u-1',
        email: registerDto.email,
        role: 'ADMIN',
        tenantId: mockTenant.id,
        status: 'ACTIVE',
      };

      mockPrisma.$transaction.mockImplementation(async (cb) => await cb(mockPrisma));
      mockPrisma.tenant.create.mockResolvedValue(mockTenant as Tenant);
      mockPrisma.user.create.mockResolvedValue(mockUser as User);
      mockPrisma.tenant.findUnique.mockResolvedValue(mockTenant as Tenant);

      const result = await service.register(registerDto);

      expect(mockPrisma.tenant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "New User's Workspace",
            status: 'ACTIVE',
          }),
        }),
      );
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: registerDto.email,
            role: 'ADMIN',
            tenantId: mockTenant.id,
          }),
        }),
      );
      expect(result).toHaveProperty('access_token');
    });

    it('should join an existing active tenant as USER when valid tenantSlug is provided', async () => {
      const mockTenant = {
        id: 't-existing',
        name: 'Existing Tenant',
        slug: 'existing',
        status: 'ACTIVE',
      };
      const mockUser = {
        id: 'u-1',
        email: registerDto.email,
        role: 'USER',
        tenantId: mockTenant.id,
        status: 'ACTIVE',
      };

      mockPrisma.$transaction.mockImplementation(async (cb) => await cb(mockPrisma));
      mockPrisma.tenant.findFirst.mockResolvedValue(mockTenant as Tenant);
      mockPrisma.user.create.mockResolvedValue(mockUser as User);
      mockPrisma.tenant.findUnique.mockResolvedValue(mockTenant as Tenant);

      const result = await service.register({ ...registerDto, tenantSlug: 'existing' });

      expect(mockPrisma.tenant.findFirst).toHaveBeenCalledWith({
        where: { slug: 'existing', deletedAt: null, status: 'ACTIVE' },
      });
      expect(mockPrisma.tenant.create).not.toHaveBeenCalled();
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'USER',
            tenantId: mockTenant.id,
          }),
        }),
      );
      expect(result).toHaveProperty('access_token');
    });

    it('should create a new tenant if provided tenantSlug is not found', async () => {
      const mockTenant = {
        id: 't-new',
        name: "New User's Workspace",
        slug: 'not-found',
        status: 'ACTIVE',
      };
      const mockUser = {
        id: 'u-1',
        email: registerDto.email,
        role: 'ADMIN',
        tenantId: mockTenant.id,
        status: 'ACTIVE',
      };

      mockPrisma.$transaction.mockImplementation(async (cb) => await cb(mockPrisma));
      mockPrisma.tenant.findFirst.mockResolvedValue(null);
      mockPrisma.tenant.create.mockResolvedValue(mockTenant as Tenant);
      mockPrisma.user.create.mockResolvedValue(mockUser as User);
      mockPrisma.tenant.findUnique.mockResolvedValue(mockTenant as Tenant);

      await service.register({ ...registerDto, tenantSlug: 'not-found' });

      expect(mockPrisma.tenant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: 'not-found' }),
        }),
      );
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: 'ADMIN' }),
        }),
      );
    });
  });
});
