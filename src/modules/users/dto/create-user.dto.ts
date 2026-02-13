import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'user@example.com', description: 'User email address' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    example: 'password123',
    minLength: 6,
    description: 'User password (optional for social login)',
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'Tenant UUID' })
  @IsUUID()
  @IsNotEmpty()
  tenantId: string;

  @ApiPropertyOptional({ enum: Role, default: Role.USER, description: 'User role' })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
