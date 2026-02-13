import { NotImplementedException } from '@nestjs/common';
import { PaymentGateway } from '../interfaces/payment-gateway.interface';
import { MercadopagoPaymentConfig } from '../interfaces/tenant-payment-config.interface';

/**
 * MercadoPago payment gateway implementation.
 * Implements PaymentGateway; integration with MercadoPago SDK can be added later.
 */
export class MercadoPagoGateway implements PaymentGateway {
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: config used when createPreference/processWebhook are implemented
  constructor(private readonly config: MercadopagoPaymentConfig) {}

  async createPreference(_amount: number, _externalId: string): Promise<unknown> {
    throw new NotImplementedException('MercadoPago createPreference not yet implemented');
  }

  async processWebhook(_payload: unknown): Promise<unknown> {
    throw new NotImplementedException('MercadoPago processWebhook not yet implemented');
  }
}
