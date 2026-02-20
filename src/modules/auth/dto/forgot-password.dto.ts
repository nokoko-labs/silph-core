import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Schema for forgot-password (multi-tenant).
 * tenantSlug is required to resolve the user unambiguously (email is unique per tenant).
 */
export const forgotPasswordSchema = z.object({
  email: z.string().email().describe('User email address'),
  tenantSlug: z
    .string()
    .min(1)
    .describe('Tenant slug to identify which tenant account to reset')
    .openapi({ example: 'acme' }),
});

export type ForgotPasswordPayload = z.infer<typeof forgotPasswordSchema>;

export class ForgotPasswordDto extends createZodDto(forgotPasswordSchema) {}
