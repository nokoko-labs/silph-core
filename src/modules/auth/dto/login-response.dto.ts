import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Response DTO for POST /auth/login.
 */
export const LoginResponseSchema = z.object({
  access_token: z.string().describe('JWT access token for Bearer authentication'),
});

export class LoginResponseDto extends createZodDto(LoginResponseSchema) {}
