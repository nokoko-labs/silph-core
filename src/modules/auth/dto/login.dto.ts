import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

/**
 * DTO for login (email + password).
 */
export class LoginDto {
  @ApiProperty({ example: 'admin@example.com', description: 'User email' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'admin123', description: 'User password', minLength: 1 })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  password!: string;
}
