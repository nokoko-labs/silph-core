import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { TenantsService } from '@/modules/tenants/tenants.service';
import { PaymentFactory } from './payment.factory';
import { MercadoPagoGateway } from './providers/mercadopago.provider';
import { PaypalGateway } from './providers/paypal.provider';

describe('PaymentFactory', () => {
  let factory: PaymentFactory;
  let tenantsService: TenantsService;

  const tenantId = '123e4567-e89b-12d3-a456-426614174000';

  const baseTenant = {
    id: tenantId,
    name: 'Acme Corp',
    slug: 'acme-corp',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTenantsService = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [PaymentFactory, { provide: TenantsService, useValue: mockTenantsService }],
    }).compile();

    factory = module.get<PaymentFactory>(PaymentFactory);
    tenantsService = module.get<TenantsService>(TenantsService);
  });

  it('should be defined', () => {
    expect(factory).toBeDefined();
  });

  describe('getService', () => {
    it('should return MercadoPagoGateway when tenant config has provider mercadopago', async () => {
      const tenant = {
        ...baseTenant,
        config: { provider: 'mercadopago', accessToken: 'test-access-token' },
      };
      mockTenantsService.findOne.mockResolvedValue(tenant);

      const gateway = await factory.getService(tenantId);

      expect(tenantsService.findOne).toHaveBeenCalledWith(tenantId);
      expect(gateway).toBeInstanceOf(MercadoPagoGateway);
    });

    it('should return PaypalGateway when tenant config has provider paypal', async () => {
      const tenant = {
        ...baseTenant,
        config: {
          provider: 'paypal',
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
        },
      };
      mockTenantsService.findOne.mockResolvedValue(tenant);

      const gateway = await factory.getService(tenantId);

      expect(tenantsService.findOne).toHaveBeenCalledWith(tenantId);
      expect(gateway).toBeInstanceOf(PaypalGateway);
    });

    it('should throw BadRequestException when tenant config is null', async () => {
      const tenant = { ...baseTenant, config: null };
      mockTenantsService.findOne.mockResolvedValue(tenant);

      await expect(factory.getService(tenantId)).rejects.toThrow(BadRequestException);
      await expect(factory.getService(tenantId)).rejects.toThrow(
        'Payment not configured for tenant',
      );
    });

    it('should throw BadRequestException when tenant config is not an object', async () => {
      const tenant = { ...baseTenant, config: 'invalid' };
      mockTenantsService.findOne.mockResolvedValue(tenant);

      await expect(factory.getService(tenantId)).rejects.toThrow(BadRequestException);
      await expect(factory.getService(tenantId)).rejects.toThrow(
        'Payment not configured for tenant',
      );
    });

    it('should throw BadRequestException when tenant config has unsupported provider', async () => {
      const tenant = {
        ...baseTenant,
        config: { provider: 'stripe', apiKey: 'key' },
      };
      mockTenantsService.findOne.mockResolvedValue(tenant);

      await expect(factory.getService(tenantId)).rejects.toThrow(BadRequestException);
      await expect(factory.getService(tenantId)).rejects.toThrow('Invalid tenant payment config');
    });

    it('should throw BadRequestException when mercadopago config is missing accessToken', async () => {
      const tenant = {
        ...baseTenant,
        config: { provider: 'mercadopago' },
      };
      mockTenantsService.findOne.mockResolvedValue(tenant);

      await expect(factory.getService(tenantId)).rejects.toThrow(BadRequestException);
      await expect(factory.getService(tenantId)).rejects.toThrow('Invalid tenant payment config');
    });

    it('should throw BadRequestException when paypal config is missing clientId or clientSecret', async () => {
      const tenant = {
        ...baseTenant,
        config: { provider: 'paypal', clientId: 'id' },
      };
      mockTenantsService.findOne.mockResolvedValue(tenant);

      await expect(factory.getService(tenantId)).rejects.toThrow(BadRequestException);
      await expect(factory.getService(tenantId)).rejects.toThrow('Invalid tenant payment config');
    });

    it('should propagate NotFoundException when tenant does not exist', async () => {
      mockTenantsService.findOne.mockRejectedValue(
        new NotFoundException(`Tenant with id "${tenantId}" not found`),
      );

      await expect(factory.getService(tenantId)).rejects.toThrow(NotFoundException);
    });
  });
});
