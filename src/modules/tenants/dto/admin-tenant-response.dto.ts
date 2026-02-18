import { TenantStatus } from '@prisma/client';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Schema for administrative tenant response.
 * Filters sensitive infrastructure data while allowing visibility into themes and integrations.
 */
export const AdminTenantResponseSchema = z.object({
  id: z.string().uuid().describe('Tenant UUID'),
  name: z.string().describe('Display name'),
  slug: z.string().describe('URL-friendly identifier'),
  status: z.nativeEnum(TenantStatus).describe('Current status of the tenant'),
  config: z
    .object({
      public: z.record(z.any()).describe('Publicly accessible configuration (themes, icons, etc.)'),
      private: z
        .object({
          activeIntegrations: z
            .array(z.string())
            .optional()
            .describe('List of safe-to-view active integrations'),
          // infrastructureKeys: z.any().optional(), // EXCLUDED by design
        })
        .describe('Filtered private configuration for ADMINs'),
    })
    .describe('Filtered tenant configuration'),
  mfaRequired: z.boolean().describe('Whether MFA is required for this tenant'),
  enabledAuthProviders: z.array(z.string()).describe('List of enabled authentication providers'),
  createdAt: z.date().describe('Creation timestamp'),
  updatedAt: z.date().describe('Last update timestamp'),
});

export type AdminTenantResponsePayload = z.infer<typeof AdminTenantResponseSchema>;

export class AdminTenantResponseDto extends createZodDto(AdminTenantResponseSchema) {}
