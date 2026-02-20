import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PaginationMetaSchema } from '@/common/dto/pagination.dto';
import { TenantResponseSchema } from './tenant-response.dto';

export const PaginatedTenantsResponseSchema = z.object({
  data: z.array(TenantResponseSchema).describe('List of tenants'),
  meta: PaginationMetaSchema.describe('Pagination metadata'),
});

export type PaginatedTenantsResponse = z.infer<typeof PaginatedTenantsResponseSchema>;

export class PaginatedTenantsResponseDto extends createZodDto(PaginatedTenantsResponseSchema) {}
