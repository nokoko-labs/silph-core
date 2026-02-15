import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Response DTO for POST /auth/login.
 */
export const LoginResponseSchema = z.object({
  access_token: z.string().optional().describe('JWT access token for Bearer authentication'),
  status: z.string().optional().describe('MFA status (e.g. MFA_REQUIRED)'),
  ticket: z.string().optional().describe('Temporary ticket for MFA verification'),
});

export type LoginResponsePayload = z.infer<typeof LoginResponseSchema>;

export class LoginResponseDto extends createZodDto(LoginResponseSchema) {}
