import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Schema for public tenant response.
 * Exposes only non-sensitive data for public consumption.
 */
export const PublicTenantResponseSchema = z.object({
  id: z.string().uuid().describe('Tenant UUID'),
  name: z.string().describe('Display name'),
  slug: z.string().describe('URL-friendly identifier'),
  enabledAuthProviders: z.array(z.string()).describe('List of enabled authentication providers'),
  googleAuthEnabled: z.boolean().describe('Whether Google OAuth is enabled for this tenant'),
  githubAuthEnabled: z.boolean().describe('Whether GitHub OAuth is enabled for this tenant'),
  config: z
    .object({
      public: z.record(z.any()).describe('Publicly accessible configuration'),
    })
    .describe('Filtered tenant configuration containing only public keys'),
});

export type PublicTenantResponsePayload = z.infer<typeof PublicTenantResponseSchema>;

export class PublicTenantResponseDto extends createZodDto(PublicTenantResponseSchema) {}
