import { createZodDto } from 'nestjs-zod';
import { CreateTenantSchema } from './create-tenant.dto';

/**
 * Schema for updating an existing tenant.
 * Uses a partial version of the CreateTenantSchema.
 */
export const UpdateTenantSchema = CreateTenantSchema.partial();

export class UpdateTenantDto extends createZodDto(UpdateTenantSchema) {}
