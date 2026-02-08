import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

/**
 * Schema for login payload (email + password).
 */
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginPayload = z.infer<typeof loginSchema>;

/**
 * DTO for Swagger documentation of POST /auth/login body.
 */
export class LoginDto {
  @ApiProperty({
    description: 'User email address',
    example: 'admin@example.com',
    required: true,
  })
  email!: string;

  @ApiProperty({
    description: 'User password',
    example: 'secret',
    required: true,
    minLength: 1,
  })
  password!: string;
}
