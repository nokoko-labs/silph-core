import { ApiProperty } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Response DTO for GET /auth/me (current user from JWT payload).
 */
export const MeResponseSchema = z.object({
  sub: z.string().describe('User ID (subject)'),
  email: z.string().email().describe('User email'),
  role: z.enum(['ADMIN', 'USER']).describe('User role'),
  tenantId: z.string().describe('Tenant ID'),
});

export class MeResponseDto extends createZodDto(MeResponseSchema) {
  @ApiProperty({
    description: 'User ID (JWT subject)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  sub!: string;

  @ApiProperty({ description: 'User email', example: 'admin@example.com' })
  email!: string;

  @ApiProperty({ description: 'User role', enum: ['ADMIN', 'USER'], example: 'ADMIN' })
  role!: 'ADMIN' | 'USER';

  @ApiProperty({ description: 'Tenant ID', example: '550e8400-e29b-41d4-a716-446655440001' })
  tenantId!: string;
}
