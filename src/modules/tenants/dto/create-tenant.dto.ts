import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { withOpenApiExample } from '@/common/zod-openapi';

/**
 * Theme subset of tenant public config (OpenAPI + validation).
 */
const ThemeSchema = z.object({
  color: withOpenApiExample(z.string().min(1).describe('Theme color'), 'red'),
  icon: withOpenApiExample(z.string().min(1).describe('Theme icon'), 'mushroom'),
});

/**
 * Public config exposed to clients (theme, etc.).
 */
const PublicConfigSchema = z.object({
  theme: ThemeSchema.describe('Theme settings'),
});

/**
 * Full tenant config: public (theme) + optional private (server-only).
 */
const ConfigSchema = z
  .object({
    public: PublicConfigSchema.describe('Public configuration (e.g. theme)'),
    private: z.record(z.unknown()).optional().describe('Private configuration (server-only)'),
  })
  .describe('Tenant configuration');

export const CreateTenantSchema = z.object({
  name: withOpenApiExample(
    z.string().min(1).max(255).describe('Display name of the tenant'),
    'Acme Corp',
  ),
  slug: withOpenApiExample(
    z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9-]+$/, {
        message: 'slug must contain only lowercase letters, numbers and hyphens (no spaces)',
      })
      .describe('Unique URL-friendly identifier (lowercase, numbers, hyphens only)'),
    'acme-corp',
  ),
  config: ConfigSchema.optional().describe('Optional tenant configuration'),
});

export type CreateTenantPayload = z.infer<typeof CreateTenantSchema>;

/**
 * DTO for POST /tenants body; validation and OpenAPI from CreateTenantSchema.
 */
export class CreateTenantDto extends createZodDto(CreateTenantSchema) {}
