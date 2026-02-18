import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ThemeDto {
  @ApiProperty({ example: 'red' })
  @IsString()
  @IsNotEmpty()
  color: string;

  @ApiProperty({ example: 'mushroom' })
  @IsString()
  @IsNotEmpty()
  icon: string;
}

export class PublicConfigDto {
  @ApiProperty({ type: ThemeDto })
  @IsObject()
  @ValidateNested()
  @Type(() => ThemeDto)
  theme: ThemeDto;
}

export class ConfigDto {
  @ApiProperty({ type: PublicConfigDto })
  @IsObject()
  @ValidateNested()
  @Type(() => PublicConfigDto)
  public: PublicConfigDto;

  @ApiPropertyOptional({ type: Object })
  @IsObject()
  @IsOptional()
  private?: Record<string, unknown>;
}

export class CreateTenantDto {
  @ApiProperty({ example: 'Acme Corp', description: 'Display name of the tenant' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiProperty({
    example: 'acme-corp',
    description: 'Unique URL-friendly identifier (lowercase, numbers, hyphens only)',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must contain only lowercase letters, numbers and hyphens (no spaces)',
  })
  slug: string;

  @ApiPropertyOptional({ type: ConfigDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ConfigDto)
  config?: ConfigDto;
}
