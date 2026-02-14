import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const forgotPasswordSchema = z.object({
  email: z.string().email().describe('User email address'),
});

export type ForgotPasswordPayload = z.infer<typeof forgotPasswordSchema>;

export class ForgotPasswordDto extends createZodDto(forgotPasswordSchema) {}
