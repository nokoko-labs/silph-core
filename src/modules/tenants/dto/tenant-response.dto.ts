import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for tenant response (single tenant or list item).
 * Aligns with Prisma Tenant model for OpenAPI documentation.
 */
export class TenantResponseDto {
  @ApiProperty({
    description: 'Unique identifier (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ description: 'Display name of the tenant', example: 'Acme Corp' })
  name!: string;

  @ApiProperty({
    description: 'URL-friendly unique identifier',
    example: 'acme-corp',
  })
  slug!: string;

  @ApiProperty({
    description: 'Whether the tenant is active',
    example: true,
    default: true,
  })
  isActive!: boolean;

  @ApiProperty({
    description: 'Optional tenant-specific config (e.g. API keys)',
    example: {},
    required: false,
    nullable: true,
  })
  config!: Record<string, unknown> | null;

  @ApiProperty({
    description: 'Creation timestamp (ISO 8601)',
    example: '2024-01-15T10:30:00.000Z',
  })
  createdAt!: string;

  @ApiProperty({
    description: 'Last update timestamp (ISO 8601)',
    example: '2024-01-15T10:30:00.000Z',
  })
  updatedAt!: string;
}
