import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Metadata for paginated list responses.
 * lastPage = ceil(total / limit).
 */
export const PaginationMetaSchema = z.object({
  total: z.number().int().min(0).describe('Total number of items'),
  page: z.number().int().min(1).describe('Current page (1-based)'),
  lastPage: z.number().int().min(0).describe('Last page number'),
});

export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

export class PaginationMetaDto extends createZodDto(PaginationMetaSchema) {}

/** Build meta from total count and pagination params. */
export function buildPaginationMeta(total: number, page: number, limit: number): PaginationMeta {
  const lastPage = limit > 0 ? Math.ceil(total / limit) : 0;
  return { total, page, lastPage };
}
