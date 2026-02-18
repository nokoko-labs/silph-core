import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { type DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaService } from '@/database/prisma.service';
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
    status: 'ACTIVE',
    config: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null as Date | null,
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
        data: { name: dto.name, slug: dto.slug, status: 'ACTIVE', config: null },
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
    it('should return all non-deleted tenants', async () => {
      const result = await service.findAll();

      expect(result).toEqual([mockTenant]);
      expect(prisma.tenant.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
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

    it('should update a tenant', async () => {
      mockPrisma.tenant.update.mockResolvedValue({ ...mockTenant, ...updateDto });

      const result = await service.update(mockTenant.id, updateDto);

      expect(result.name).toEqual(updateDto.name);
      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: mockTenant.id },
        data: { ...updateDto, config: undefined },
      });
    });

    it('should throw ConflictException when updating slug to an existing one', async () => {
      const dto = { slug: 'already-exists' };
      prisma.tenant.update.mockRejectedValue(createPrismaP2002Error());

      await expect(service.update(mockTenant.id, dto)).rejects.toThrow(ConflictException);
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
});
