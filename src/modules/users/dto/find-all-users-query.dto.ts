import { Role, UserStatus } from '@prisma/client';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const allowedUserSortFields = ['createdAt', 'updatedAt', 'email', 'role', 'status'] as const;

export const FindAllUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).describe('Page number (1-based)'),
  limit: z.coerce.number().int().min(1).max(100).default(10).describe('Items per page (max 100)'),
  role: z.nativeEnum(Role).optional().describe('Filter by user role'),
  status: z.nativeEnum(UserStatus).optional().describe('Filter by user status'),
  sortBy: z.enum(allowedUserSortFields).default('createdAt').describe('Field to sort by'),
  sortOrder: z.enum(['asc', 'desc']).default('desc').describe('Sort direction'),
});

export type FindAllUsersQuery = z.infer<typeof FindAllUsersQuerySchema>;

export class FindAllUsersQueryDto extends createZodDto(FindAllUsersQuerySchema) {}

export { allowedUserSortFields };
