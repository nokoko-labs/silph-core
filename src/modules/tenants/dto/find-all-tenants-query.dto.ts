import { TenantStatus } from '@prisma/client';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const allowedTenantSortFields = ['createdAt', 'updatedAt', 'name', 'slug', 'status'] as const;

export const FindAllTenantsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).describe('Page number (1-based)'),
  limit: z.coerce.number().int().min(1).max(100).default(10).describe('Items per page (max 100)'),
  status: z.nativeEnum(TenantStatus).optional().describe('Filter by tenant status'),
  sortBy: z.enum(allowedTenantSortFields).default('createdAt').describe('Field to sort by'),
  sortOrder: z.enum(['asc', 'desc']).default('desc').describe('Sort direction'),
});

export type FindAllTenantsQuery = z.infer<typeof FindAllTenantsQuerySchema>;

export class FindAllTenantsQueryDto extends createZodDto(FindAllTenantsQuerySchema) {}

export { allowedTenantSortFields };
