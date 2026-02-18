import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Schema for POST /auth/select-tenant body.
 * Receives tempToken from login (multi-tenant flow) and the chosen tenantId.
 */
export const selectTenantSchema = z.object({
  tempToken: z.string().min(1).describe('Short-lived token from login tenant-selection response'),
  tenantId: z.string().uuid().describe('Tenant UUID selected by the user'),
});

export type SelectTenantPayload = z.infer<typeof selectTenantSchema>;

/**
 * DTO for POST /auth/select-tenant; validation and OpenAPI from selectTenantSchema.
 */
export class SelectTenantDto extends createZodDto(selectTenantSchema) {}
