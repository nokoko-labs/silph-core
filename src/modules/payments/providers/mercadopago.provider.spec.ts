import { NotImplementedException } from '@nestjs/common';
import { MercadoPagoGateway } from './mercadopago.provider';

describe('MercadoPagoGateway', () => {
  let gateway: MercadoPagoGateway;
  const mockConfig = {
    accessToken: 'access-token',
  };

  beforeEach(() => {
    gateway = new MercadoPagoGateway(mockConfig);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('createPreference', () => {
    it('should throw NotImplementedException', async () => {
      await expect(gateway.createPreference(100, 'external-id')).rejects.toThrow(
        NotImplementedException,
      );
    });
  });

  describe('processWebhook', () => {
    it('should throw NotImplementedException', async () => {
      await expect(gateway.processWebhook({})).rejects.toThrow(NotImplementedException);
    });
  });
});
