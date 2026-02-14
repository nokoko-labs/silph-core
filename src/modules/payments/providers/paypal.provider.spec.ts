import { NotImplementedException } from '@nestjs/common';
import { PaypalGateway } from './paypal.provider';

describe('PaypalGateway', () => {
  let gateway: PaypalGateway;
  const mockConfig = {
    clientId: 'client-id',
    clientSecret: 'client-secret',
  };

  beforeEach(() => {
    gateway = new PaypalGateway(mockConfig);
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
