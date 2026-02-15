import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const mfaVerifySchema = z.object({
  mfaToken: z.string().describe('Temporary MFA token'),
  code: z.string().min(6).max(6).describe('6-digit MFA code'),
});

export class MfaVerifyDto extends createZodDto(mfaVerifySchema) {}
