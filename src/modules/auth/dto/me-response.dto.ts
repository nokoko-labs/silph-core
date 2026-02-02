import { ApiProperty } from '@nestjs/swagger';

/**
 * Response DTO for GET /auth/me (current user from JWT payload).
 */
export class MeResponseDto {
  @ApiProperty({ description: 'User ID (subject)' })
  sub: string;

  @ApiProperty({ description: 'User email' })
  email: string;

  @ApiProperty({ description: 'User role', enum: ['ADMIN', 'USER'] })
  role: string;

  @ApiProperty({ description: 'Tenant ID' })
  tenantId: string;
}
