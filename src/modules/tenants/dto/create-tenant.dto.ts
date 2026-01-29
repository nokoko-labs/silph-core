import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * DTO for creating a new tenant.
 * Slug must be lowercase alphanumeric with hyphens only (no spaces).
 */
export class CreateTenantDto {
  @ApiProperty({ example: 'Acme Corp', description: 'Display name of the tenant' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiProperty({
    example: 'acme-corp',
    description: 'Unique URL-friendly identifier (lowercase, numbers, hyphens only)',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must contain only lowercase letters, numbers and hyphens (no spaces)',
  })
  @MaxLength(100)
  slug!: string;
}
