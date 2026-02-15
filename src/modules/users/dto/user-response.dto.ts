import { Role } from '@prisma/client';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UserResponseSchema = z.object({
  id: z.string().uuid().describe('User UUID'),
  email: z.string().email().describe('User email address'),
  role: z.nativeEnum(Role).describe('User role'),
  tenantId: z.string().uuid().describe('Tenant UUID'),
  createdAt: z.date().describe('Creation timestamp'),
  updatedAt: z.date().describe('Last update timestamp'),
  accounts: z
    .array(
      z.object({
        id: z.string().uuid().describe('Account UUID'),
        provider: z.string().describe('Provider name (e.g. google)'),
        providerAccountId: z.string().describe('Provider account ID'),
        createdAt: z.date().describe('Account creation timestamp'),
        updatedAt: z.date().describe('Account update timestamp'),
      }),
    )
    .optional()
    .describe('Linked social accounts'),
});

export class UserResponseDto extends createZodDto(UserResponseSchema) {}
