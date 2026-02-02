import { z } from 'zod';

/**
 * Zod schema for MercadoPago tenant payment config (stored in Tenant.config).
 */
export const mercadopagoPaymentConfigSchema = z.object({
  provider: z.literal('mercadopago'),
  accessToken: z.string().min(1),
});

/**
 * Zod schema for PayPal tenant payment config (stored in Tenant.config).
 */
export const paypalPaymentConfigSchema = z.object({
  provider: z.literal('paypal'),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

/**
 * Discriminated union: valid payment config for any supported provider.
 */
export const tenantPaymentConfigSchema = z.discriminatedUnion('provider', [
  mercadopagoPaymentConfigSchema,
  paypalPaymentConfigSchema,
]);

export type MercadopagoPaymentConfig = z.infer<typeof mercadopagoPaymentConfigSchema>;
export type PaypalPaymentConfig = z.infer<typeof paypalPaymentConfigSchema>;
export type TenantPaymentConfig = z.infer<typeof tenantPaymentConfigSchema>;
