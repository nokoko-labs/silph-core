import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const mfaEnableSchema = z.object({
  code: z.string().min(6).max(6).describe('6-digit MFA code'),
});

export class MfaEnableDto extends createZodDto(mfaEnableSchema) {}
