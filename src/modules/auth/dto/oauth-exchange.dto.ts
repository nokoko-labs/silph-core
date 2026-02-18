import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const oauthExchangeSchema = z.object({
  code: z
    .string()
    .min(1, 'Code is required')
    .describe('OAuth authorization code from Google callback redirect'),
  tenantSlug: z
    .string()
    .min(1)
    .optional()
    .describe('Tenant context (for logging/audit); primary context comes from OAuth init'),
});

export type OauthExchangePayload = z.infer<typeof oauthExchangeSchema>;

export class OauthExchangeDto extends createZodDto(oauthExchangeSchema) {}
