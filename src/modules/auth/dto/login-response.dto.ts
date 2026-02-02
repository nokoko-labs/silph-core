import { ApiProperty } from '@nestjs/swagger';

/**
 * Response DTO for POST /auth/login.
 */
export class LoginResponseDto {
  @ApiProperty({
    description: 'JWT access token for Bearer authentication',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  access_token: string;
}
