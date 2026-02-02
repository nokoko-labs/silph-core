import { NotImplementedException } from '@nestjs/common';
import type { PaymentGateway } from '../interfaces/payment-gateway.interface';
import type { PaypalPaymentConfig } from '../interfaces/tenant-payment-config.interface';

/**
 * PayPal payment gateway implementation.
 * Implements PaymentGateway; integration with PayPal SDK can be added later.
 */
export class PaypalGateway implements PaymentGateway {
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: config used when createPreference/processWebhook are implemented
  constructor(private readonly config: PaypalPaymentConfig) {}

  async createPreference(_amount: number, _externalId: string): Promise<unknown> {
    throw new NotImplementedException('PayPal createPreference not yet implemented');
  }

  async processWebhook(_payload: unknown): Promise<unknown> {
    throw new NotImplementedException('PayPal processWebhook not yet implemented');
  }
}
