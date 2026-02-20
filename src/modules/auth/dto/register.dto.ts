import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { withOpenApiExample } from '@/common/zod-openapi';

export const registerSchema = z.object({
  email: withOpenApiExample(z.string().email().describe('User email'), 'user@example.com'),
  password: z.string().min(8).describe('Password (min 8 characters)'),
  name: withOpenApiExample(z.string().min(2).describe('Display name'), 'Jane Doe'),
  tenantSlug: withOpenApiExample(
    z.string().optional().describe('Slug of existing tenant to join'),
    'acme',
  ),
  tenantName: withOpenApiExample(
    z.string().optional().describe('Name for new tenant when creating one'),
    'Acme Corp',
  ),
});

export class RegisterDto extends createZodDto(registerSchema) {}

export type RegisterPayload = z.infer<typeof registerSchema>;
