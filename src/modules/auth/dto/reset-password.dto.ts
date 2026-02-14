import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const resetPasswordSchema = z.object({
  token: z.string().min(1).describe('Password reset token'),
  newPassword: z.string().min(8).describe('New password (min 8 characters)'),
});

export type ResetPasswordPayload = z.infer<typeof resetPasswordSchema>;

export class ResetPasswordDto extends createZodDto(resetPasswordSchema) {}
