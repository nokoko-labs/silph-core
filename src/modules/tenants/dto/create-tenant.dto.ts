import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Schema for creating a new tenant.
 * Slug must be lowercase alphanumeric with hyphens only (no spaces).
 */
export const CreateTenantSchema = z.object({
  name: z.string().min(1).max(255).describe('Display name of the tenant'),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, {
      message: 'slug must contain only lowercase letters, numbers and hyphens (no spaces)',
    })
    .describe('Unique URL-friendly identifier (lowercase, numbers, hyphens only)'),
});

export type CreateTenantPayload = z.infer<typeof CreateTenantSchema>;

export class CreateTenantDto extends createZodDto(CreateTenantSchema) {}
