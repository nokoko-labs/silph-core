import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CreateTenantSchema } from './create-tenant.dto';

/**
 * Schema for updating an existing tenant (all fields optional).
 */
export const UpdateTenantSchema = CreateTenantSchema.partial();

export type UpdateTenantPayload = z.infer<typeof UpdateTenantSchema>;

/**
 * DTO for PATCH /tenants/:id body; validation and OpenAPI from UpdateTenantSchema.
 */
export class UpdateTenantDto extends createZodDto(UpdateTenantSchema) {}
