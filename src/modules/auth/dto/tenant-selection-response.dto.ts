import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Minimal tenant info returned when user must select one (multi-tenant login).
 */
export const TenantItemSchema = z.object({
  id: z.string().uuid().describe('Tenant UUID'),
  name: z.string().describe('Tenant display name'),
  slug: z.string().describe('Tenant URL-friendly identifier'),
});

/**
 * Response when user belongs to multiple tenants.
 * access_token is a selection JWT (sub + email, no tenantId). Frontend redirects to /select-tenant?token=access_token.
 * suggestedTenant is set when login body included tenantSlug or tenantId and that tenant is in the user's list.
 */
export const TenantSelectionResponseSchema = z.object({
  access_token: z
    .string()
    .describe(
      'Selection JWT (sub + email, no tenantId); use as Bearer or send in POST /auth/select-tenant',
    ),
  needsSelection: z
    .literal(true)
    .describe('Flag indicating tenant selection is required; redirect to /select-tenant?token=...'),
  suggestedTenant: z
    .string()
    .optional()
    .describe(
      'Tenant slug to pre-select when login came from a tenant-specific form (tenantSlug/tenantId in body)',
    ),
  tenants: z
    .array(TenantItemSchema)
    .min(2)
    .describe('List of tenants the user belongs to; client must show selection UI'),
});

export type TenantSelectionResponsePayload = z.infer<typeof TenantSelectionResponseSchema>;

export class TenantSelectionResponseDto extends createZodDto(TenantSelectionResponseSchema) {}
