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
 * Contains list of tenants and a short-lived tempToken for select-tenant step.
 */
export const TenantSelectionResponseSchema = z.object({
  tenants: z
    .array(TenantItemSchema)
    .min(2)
    .describe('List of tenants the user belongs to; client must show selection UI'),
  tempToken: z
    .string()
    .describe('Short-lived JWT (5 min) to exchange for final JWT via POST /auth/select-tenant'),
});

export type TenantSelectionResponsePayload = z.infer<typeof TenantSelectionResponseSchema>;

export class TenantSelectionResponseDto extends createZodDto(TenantSelectionResponseSchema) {}
