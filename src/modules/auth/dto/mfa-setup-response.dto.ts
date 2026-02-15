import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const mfaSetupResponseSchema = z.object({
  qrCode: z.string().describe('Base64 encoded QR code PNG'),
  secret: z.string().describe('MFA secret key'),
  otpauthUrl: z.string().describe('OTP Auth URL'),
});

export class MfaSetupResponseDto extends createZodDto(mfaSetupResponseSchema) {}
