import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Schema for POST /auth/select-tenant body.
 * Receives selection token (access_token from login) or legacy tempToken, and the chosen tenantId.
 */
export const selectTenantSchema = z.object({
  tempToken: z
    .string()
    .min(1)
    .describe(
      'Selection JWT (access_token from login) or legacy tempToken; exchange with tenantId for final JWT',
    ),
  tenantId: z.string().uuid().describe('Tenant UUID selected by the user'),
});

export type SelectTenantPayload = z.infer<typeof selectTenantSchema>;

/**
 * DTO for POST /auth/select-tenant; validation and OpenAPI from selectTenantSchema.
 */
export class SelectTenantDto extends createZodDto(selectTenantSchema) {}
