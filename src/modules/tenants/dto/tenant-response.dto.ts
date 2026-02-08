import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Schema for tenant response (single tenant or list item).
 * Aligns with Prisma Tenant model; validation and OpenAPI generated from schema.
 */
export const TenantResponseSchema = z.object({
  id: z.string().uuid().describe('Tenant UUID'),
  name: z.string().describe('Display name'),
  slug: z.string().describe('URL-friendly identifier'),
  isActive: z.boolean().default(true).describe('Whether the tenant is active'),
  config: z.record(z.unknown()).nullable().optional().describe('Optional tenant configuration'),
  createdAt: z.string().datetime().describe('Creation timestamp (ISO 8601)'),
  updatedAt: z.string().datetime().describe('Last update timestamp (ISO 8601)'),
});

export type TenantResponsePayload = z.infer<typeof TenantResponseSchema>;

export class TenantResponseDto extends createZodDto(TenantResponseSchema) {}
