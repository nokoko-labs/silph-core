import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  tenantSlug: z.string().optional(),
  tenantName: z.string().optional(),
});

export class RegisterDto extends createZodDto(registerSchema) {}

export type RegisterPayload = z.infer<typeof registerSchema>;
