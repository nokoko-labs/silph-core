import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Schema for tenant response (single tenant or list item).
 * Aligns with Prisma Tenant model; validation and OpenAPI generated from schema.
 */
export const TenantResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  isActive: z.boolean().default(true),
  config: z.record(z.unknown()).nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type TenantResponsePayload = z.infer<typeof TenantResponseSchema>;

export class TenantResponseDto extends createZodDto(TenantResponseSchema) {}
