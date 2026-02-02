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

export class MeResponseDto extends createZodDto(MeResponseSchema) {}
