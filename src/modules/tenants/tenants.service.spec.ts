import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Prisma, Role } from '@prisma/client';
import { type DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaService } from '@/database/prisma.service';
import type { JwtPayload } from '@/modules/auth/auth.service';
import type { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantsService } from './tenants.service';

function createPrismaP2002Error(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.x',
  });
}

describe('TenantsService', () => {
  let service: TenantsService;
  let prisma: DeepMockProxy<PrismaService>;

  const mockTenant = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Acme Corp',
    slug: 'acme-corp',
    status: 'ACTIVE' as const,
    config: null,
    mfaRequired: false,
    enabledAuthProviders: ['password'],
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null as Date | null,
  };

  const defaultQuery = {
    page: 1,
    limit: 10,
    sortBy: 'createdAt' as const,
    sortOrder: 'desc' as const,
  };

  const mockPrisma = mockDeep<PrismaService>();

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.tenant.create.mockResolvedValue(mockTenant);
    mockPrisma.tenant.findMany.mockResolvedValue([mockTenant]);
    mockPrisma.tenant.findUnique.mockResolvedValue(mockTenant);

    const module: TestingModule = await Test.createTestingModule({
      providers: [TenantsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<TenantsService>(TenantsService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a tenant', async () => {
      const dto = { name: 'Acme Corp', slug: 'acme-corp' };
      const result = await service.create(dto);

      expect(result).toEqual(mockTenant);
      expect(prisma.tenant.create).toHaveBeenCalledWith({
        data: { name: dto.name, slug: dto.slug, status: 'ACTIVE', config: Prisma.JsonNull },
      });
    });

    it('should throw ConflictException when slug already exists', async () => {
      const dto = { name: 'Acme Corp', slug: 'acme-corp' };
      prisma.tenant.create.mockRejectedValue(createPrismaP2002Error());

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      await expect(service.create(dto)).rejects.toThrow(
        `Tenant with slug "${dto.slug}" already exists`,
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated tenants for SUPER_ADMIN', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([mockTenant]);
      mockPrisma.tenant.count.mockResolvedValue(1);

      const result = await service.findAll(
        { sub: 'u', email: 'a@b.com', role: Role.SUPER_ADMIN, tenantId: 't', status: 'ACTIVE' },
        defaultQuery,
      );

      expect(result).toEqual({
        data: [{ ...mockTenant, userRole: Role.SUPER_ADMIN }],
        meta: { total: 1, page: 1, lastPage: 1 },
      });
      expect(prisma.tenant.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      });
      expect(prisma.tenant.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
    });

    it('should restrict to tenants where user has membership for non-SUPER_ADMIN', async () => {
      const tenantWithUsers = { ...mockTenant, users: [{ role: Role.ADMIN }] };
      mockPrisma.tenant.findMany.mockResolvedValue([tenantWithUsers]);
      mockPrisma.tenant.count.mockResolvedValue(1);

      const result = await service.findAll(
        { sub: 'u', email: 'a@b.com', role: Role.ADMIN, tenantId: mockTenant.id, status: 'ACTIVE' },
        defaultQuery,
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ ...mockTenant, userRole: Role.ADMIN });
      expect(prisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            status: 'ACTIVE',
            users: {
              some: { email: 'a@b.com', deletedAt: null, status: { in: ['ACTIVE', 'PENDING'] } },
            },
            bypassTenantId: true,
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a tenant by id', async () => {
      const result = await service.findOne(mockTenant.id);

      expect(result).toEqual(mockTenant);
      expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { id: mockTenant.id },
      });
    });

    it('should throw NotFoundException when tenant is marked as DELETED', async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        ...mockTenant,
        status: 'DELETED',
      });

      await expect(service.findOne(mockTenant.id)).rejects.toThrow(NotFoundException);
    });

    it('should filter config for ADMIN role', async () => {
      const tenantWithPrivateConfig = {
        ...mockTenant,
        config: {
          public: { theme: 'blue' },
          private: {
            activeIntegrations: ['stripe'],
            infrastructureKeys: 'secret-key',
          },
        },
      };
      prisma.tenant.findUnique.mockResolvedValue(tenantWithPrivateConfig);

      const result = await service.findOne(mockTenant.id, 'ADMIN');

      expect(result.config).toEqual({
        public: { theme: 'blue' },
        private: { activeIntegrations: ['stripe'] },
      });
      // Ensure infrastructureKeys is NOT present
      expect(
        (result.config as unknown as Record<string, Record<string, unknown>>).private
          .infrastructureKeys,
      ).toBeUndefined();
    });

    it('should throw NotFoundException when tenant does not exist', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent-id')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('non-existent-id')).rejects.toThrow(
        'Tenant with id "non-existent-id" not found',
      );
    });
  });

  describe('findBySlug', () => {
    it('should return a tenant by slug', async () => {
      const result = await service.findBySlug(mockTenant.slug);

      expect(result).toEqual(mockTenant);
      expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { slug: mockTenant.slug, deletedAt: null },
      });
    });

    it('should throw NotFoundException when tenant slug does not exist', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.findBySlug('non-existent-slug')).rejects.toThrow(NotFoundException);
      await expect(service.findBySlug('non-existent-slug')).rejects.toThrow(
        'Tenant with slug "non-existent-slug" not found',
      );
    });
  });

  describe('update', () => {
    const updateDto = { name: 'Acme Updated' };
    const superAdminUser: JwtPayload = {
      sub: 'user-1',
      email: 'super@kodama.com',
      role: 'SUPER_ADMIN',
      tenantId: 'other-tenant',
      status: 'ACTIVE',
    };

    const adminUser: JwtPayload = {
      sub: 'user-2',
      email: 'admin@acme.com',
      role: 'ADMIN',
      tenantId: mockTenant.id,
      status: 'ACTIVE',
    };

    it('should update a tenant (called by SUPER_ADMIN)', async () => {
      const updatedTenant = { ...mockTenant, ...updateDto };
      mockPrisma.tenant.update.mockResolvedValue(updatedTenant);
      // First call for findOne inside update, second call for final response
      mockPrisma.tenant.findUnique
        .mockResolvedValueOnce(mockTenant)
        .mockResolvedValueOnce(updatedTenant);

      const result = await service.update(mockTenant.id, updateDto, superAdminUser);

      expect(result).toBeDefined();
      expect((result as { name: string }).name).toEqual(updateDto.name);
      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: mockTenant.id },
        data: expect.objectContaining({ name: updateDto.name }),
      });
    });

    it('should update own tenant (called by ADMIN)', async () => {
      const updatedTenant = { ...mockTenant, ...updateDto };
      mockPrisma.tenant.update.mockResolvedValue(updatedTenant);
      mockPrisma.tenant.findUnique
        .mockResolvedValueOnce(mockTenant)
        .mockResolvedValueOnce(updatedTenant);

      const result = await service.update(mockTenant.id, updateDto, adminUser);

      expect(result).toBeDefined();
      expect((result as { name: string }).name).toEqual(updateDto.name);
      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: mockTenant.id },
        data: expect.objectContaining({ name: updateDto.name }),
      });
    });

    it('should throw ForbiddenException if ADMIN tries to update another tenant', async () => {
      const otherAdmin = { ...adminUser, tenantId: 'different-id' };
      await expect(service.update(mockTenant.id, updateDto, otherAdmin)).rejects.toThrow(
        import('@nestjs/common').ForbiddenException,
      );
    });

    it('should ignore slug update if called by ADMIN', async () => {
      const dtoWithSlug = { name: 'New Name', slug: 'new-slug' };
      mockPrisma.tenant.update.mockResolvedValue({ ...mockTenant, name: 'New Name' });

      await service.update(mockTenant.id, dtoWithSlug, adminUser);

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: mockTenant.id },
        data: expect.not.objectContaining({ slug: 'new-slug' }),
      });
    });

    it('should allow slug update if called by SUPER_ADMIN', async () => {
      const dtoWithSlug = { name: 'New Name', slug: 'new-slug' };
      mockPrisma.tenant.update.mockResolvedValue({ ...mockTenant, ...dtoWithSlug });

      await service.update(mockTenant.id, dtoWithSlug, superAdminUser);

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: mockTenant.id },
        data: expect.objectContaining({ slug: 'new-slug' }),
      });
    });

    it('should deep merge config.public and ignore config.private if called by ADMIN', async () => {
      const existingTenant = {
        ...mockTenant,
        config: {
          public: { theme: 'blue', logo: 'old.png' },
          private: { apiKey: 'secret' },
        },
      };
      prisma.tenant.findUnique.mockResolvedValue(existingTenant);

      const updateConfigDto = {
        config: {
          public: { theme: 'red' },
          private: { apiKey: 'hacked' },
        },
      };

      await service.update(mockTenant.id, updateConfigDto as UpdateTenantDto, adminUser);

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: mockTenant.id },
        data: expect.objectContaining({
          config: {
            public: { theme: 'red', logo: 'old.png' },
            private: { apiKey: 'secret' },
          },
        }),
      });
    });

    it('should allow full config update if called by SUPER_ADMIN', async () => {
      const existingTenant = {
        ...mockTenant,
        config: {
          public: { theme: 'blue' },
          private: { apiKey: 'secret' },
        },
      };
      prisma.tenant.findUnique.mockResolvedValue(existingTenant);

      const updateConfigDto = {
        config: {
          public: { theme: 'red' },
          private: { apiKey: 'new-secret' },
        },
      };

      await service.update(mockTenant.id, updateConfigDto as UpdateTenantDto, superAdminUser);

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: mockTenant.id },
        data: expect.objectContaining({
          config: {
            public: { theme: 'red' },
            private: { apiKey: 'new-secret' },
          },
        }),
      });
    });

    it('should throw ConflictException when updating slug to an existing one', async () => {
      const dto = { slug: 'already-exists' };
      prisma.tenant.update.mockRejectedValue(createPrismaP2002Error());

      await expect(service.update(mockTenant.id, dto, superAdminUser)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('remove', () => {
    it('should soft delete a tenant and its users when no active users exist', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.tenant.update.mockResolvedValue({ ...mockTenant, deletedAt: new Date() });
      mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.$transaction.mockImplementation(async (callback) => callback(mockPrisma));

      await service.remove(mockTenant.id);

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: mockTenant.id },
        data: {
          status: 'DELETED',
          deletedAt: expect.any(Date),
        },
      });
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { tenantId: mockTenant.id, deletedAt: null },
        data: {
          status: 'DELETED',
          deletedAt: expect.any(Date),
        },
      });
    });

    it('should throw PreconditionFailedException if active users exist', async () => {
      mockPrisma.user.count.mockResolvedValue(2);

      await expect(service.remove(mockTenant.id)).rejects.toThrow(
        import('@nestjs/common').PreconditionFailedException,
      );
    });
  });

  describe('isSlugAvailable', () => {
    it('should return true if slug is not taken', async () => {
      mockPrisma.tenant.count.mockResolvedValue(0);

      const result = await service.isSlugAvailable('new-slug');

      expect(result).toBe(true);
      expect(prisma.tenant.count).toHaveBeenCalledWith({
        where: { slug: { equals: 'new-slug', mode: 'insensitive' } },
      });
    });

    it('should return false if slug is already taken (case-insensitive)', async () => {
      mockPrisma.tenant.count.mockResolvedValue(1);

      const result = await service.isSlugAvailable('ACME-CORP');

      expect(result).toBe(false);
      expect(prisma.tenant.count).toHaveBeenCalledWith({
        where: { slug: { equals: 'ACME-CORP', mode: 'insensitive' } },
      });
    });
  });
});
