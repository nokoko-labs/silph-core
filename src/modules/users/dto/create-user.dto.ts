import { Role } from '@prisma/client';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { withOpenApiExample } from '@/common/zod-openapi';

export const CreateUserSchema = z.object({
  email: withOpenApiExample(z.string().email().describe('User email address'), 'user@example.com'),
  password: z.string().min(6).optional().describe('User password (optional for social login)'),
  tenantId: z.string().uuid().describe('Tenant UUID'),
  role: withOpenApiExample(z.nativeEnum(Role).default(Role.USER).describe('User role'), Role.USER),
});

export class CreateUserDto extends createZodDto(CreateUserSchema) {}
