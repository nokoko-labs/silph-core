import { ApiProperty } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Response DTO for POST /auth/login.
 */
export const LoginResponseSchema = z.object({
  access_token: z.string().describe('JWT access token for Bearer authentication'),
});

export class LoginResponseDto extends createZodDto(LoginResponseSchema) {
  @ApiProperty({
    description: 'JWT access token for Bearer authentication',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  access_token!: string;
}
