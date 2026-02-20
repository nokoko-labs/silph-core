import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const tenantSlugLogin = z
  .string()
  .min(1)
  .optional()
  .describe('Tenant slug for direct tenant login; when provided, skips tenant selection');
const tenantSlugLoginWithExample =
  typeof (tenantSlugLogin as { openapi?: (opts: { example: string }) => unknown }).openapi ===
  'function'
    ? (
        tenantSlugLogin as unknown as {
          openapi: (opts: { example: string }) => typeof tenantSlugLogin;
        }
      ).openapi({ example: 'acme' })
    : tenantSlugLogin;

/**
 * Schema for login payload (email + password).
 * Optional tenantSlug enables Direct Tenant Login (single lookup by email+tenantId).
 */
export const loginSchema = z.object({
  email: z.string().email().describe('User email address'),
  password: z.string().min(1).describe('User password'),
  tenantSlug: tenantSlugLoginWithExample,
});

export type LoginPayload = z.infer<typeof loginSchema>;

/**
 * DTO for POST /auth/login body; validation and OpenAPI from loginSchema.
 */
export class LoginDto extends createZodDto(loginSchema) {}
