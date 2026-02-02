import { BadRequestException, Injectable } from '@nestjs/common';
import { TenantsService } from '@/modules/tenants/tenants.service';
import type { PaymentGateway } from './interfaces/payment-gateway.interface';
import { tenantPaymentConfigSchema } from './interfaces/tenant-payment-config.interface';
import { MercadoPagoGateway } from './providers/mercadopago.provider';
import { PaypalGateway } from './providers/paypal.provider';

/**
 * Factory that resolves the correct PaymentGateway for a tenant based on tenant.config.
 * Fetches tenant from DB, validates payment config with Zod, and instantiates the provider.
 */
@Injectable()
export class PaymentFactory {
  constructor(private readonly tenantsService: TenantsService) {}

  async getService(tenantId: string): Promise<PaymentGateway> {
    const tenant = await this.tenantsService.findOne(tenantId);

    if (tenant.config == null || typeof tenant.config !== 'object') {
      throw new BadRequestException('Payment not configured for tenant');
    }

    const parseResult = tenantPaymentConfigSchema.safeParse(tenant.config);
    if (!parseResult.success) {
      const message = parseResult.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join('; ');
      throw new BadRequestException(`Invalid tenant payment config: ${message}`);
    }

    const config = parseResult.data;

    switch (config.provider) {
      case 'mercadopago':
        return new MercadoPagoGateway(config);
      case 'paypal':
        return new PaypalGateway(config);
      default: {
        const _exhaustive: never = config;
        throw new BadRequestException('Unsupported payment provider');
      }
    }
  }
}
