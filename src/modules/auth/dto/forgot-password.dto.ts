import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const tenantSlugForgot = z
  .string()
  .min(1)
  .describe('Tenant slug to identify which tenant account to reset');
const tenantSlugWithExample =
  typeof (tenantSlugForgot as { openapi?: (opts: { example: string }) => unknown }).openapi ===
  'function'
    ? (
        tenantSlugForgot as unknown as {
          openapi: (opts: { example: string }) => typeof tenantSlugForgot;
        }
      ).openapi({ example: 'acme' })
    : tenantSlugForgot;

/**
 * Schema for forgot-password (multi-tenant).
 * tenantSlug is required to resolve the user unambiguously (email is unique per tenant).
 */
export const forgotPasswordSchema = z.object({
  email: z.string().email().describe('User email address'),
  tenantSlug: tenantSlugWithExample,
});

export type ForgotPasswordPayload = z.infer<typeof forgotPasswordSchema>;

export class ForgotPasswordDto extends createZodDto(forgotPasswordSchema) {}
