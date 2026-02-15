import { Role } from '@prisma/client';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateUserSchema = z.object({
  email: z.string().email().describe('User email address'),
  password: z.string().min(6).optional().describe('User password (optional for social login)'),
  tenantId: z.string().uuid().describe('Tenant UUID'),
  role: z.nativeEnum(Role).default(Role.USER).describe('User role'),
});

export class CreateUserDto extends createZodDto(CreateUserSchema) {}
