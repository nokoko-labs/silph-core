import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

describe('TenantsController', () => {
  let controller: TenantsController;
  let service: TenantsService;

  const mockTenant = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Acme Corp',
    slug: 'acme-corp',
    isActive: true,
    config: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTenantsService = {
    create: jest.fn().mockResolvedValue(mockTenant),
    findAll: jest.fn().mockResolvedValue([mockTenant]),
    findOne: jest.fn().mockResolvedValue(mockTenant),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantsController],
      providers: [{ provide: TenantsService, useValue: mockTenantsService }],
    }).compile();

    controller = module.get<TenantsController>(TenantsController);
    service = module.get<TenantsService>(TenantsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a tenant and return it', async () => {
      const dto = { name: 'Acme Corp', slug: 'acme-corp' };
      const result = await controller.create(dto);

      expect(result).toEqual(mockTenant);
      expect(service.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('findAll', () => {
    it('should return an array of tenants', async () => {
      const result = await controller.findAll();

      expect(result).toEqual([mockTenant]);
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a tenant by id', async () => {
      const result = await controller.findOne(mockTenant.id);

      expect(result).toEqual(mockTenant);
      expect(service.findOne).toHaveBeenCalledWith(mockTenant.id);
    });

    it('should propagate NotFoundException when tenant not found', async () => {
      (service.findOne as jest.Mock).mockRejectedValue(
        new NotFoundException('Tenant with id "bad-id" not found'),
      );

      await expect(controller.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
