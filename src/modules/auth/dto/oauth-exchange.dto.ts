import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const oauthExchangeSchema = z.object({
  code: z
    .string()
    .min(1, 'Code is required')
    .describe('OAuth authorization code from Google callback redirect'),
});

export type OauthExchangePayload = z.infer<typeof oauthExchangeSchema>;

export class OauthExchangeDto extends createZodDto(oauthExchangeSchema) {}
