import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
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
  let prisma: PrismaService;

  const mockTenant = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Acme Corp',
    slug: 'acme-corp',
    isActive: true,
    config: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrisma = {
    tenant: {
      create: jest.fn().mockResolvedValue(mockTenant),
      findMany: jest.fn().mockResolvedValue([mockTenant]),
      findUnique: jest.fn().mockResolvedValue(mockTenant),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [TenantsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<TenantsService>(TenantsService);
    prisma = module.get<PrismaService>(PrismaService);
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
        data: { name: dto.name, slug: dto.slug },
      });
    });

    it('should throw ConflictException when slug already exists', async () => {
      const dto = { name: 'Acme Corp', slug: 'acme-corp' };
      (prisma.tenant.create as jest.Mock).mockRejectedValue(createPrismaP2002Error());

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      await expect(service.create(dto)).rejects.toThrow(
        `Tenant with slug "${dto.slug}" already exists`,
      );
    });
  });

  describe('findAll', () => {
    it('should return all tenants', async () => {
      const result = await service.findAll();

      expect(result).toEqual([mockTenant]);
      expect(prisma.tenant.findMany).toHaveBeenCalledWith({
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

    it('should throw NotFoundException when tenant does not exist', async () => {
      (prisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('non-existent-id')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('non-existent-id')).rejects.toThrow(
        'Tenant with id "non-existent-id" not found',
      );
    });
  });
});
