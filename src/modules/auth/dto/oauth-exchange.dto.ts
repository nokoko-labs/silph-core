import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const oauthExchangeSchema = z.object({
  code: z.string().min(1, 'Code is required'),
});

export class OauthExchangeDto extends createZodDto(oauthExchangeSchema) {}
