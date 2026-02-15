import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const mfaVerifySchema = z.object({
  ticket: z.string().describe('Temporary MFA ticket'),
  code: z.string().min(6).max(6).describe('6-digit MFA code'),
});

export class MfaVerifyDto extends createZodDto(mfaVerifySchema) {}
