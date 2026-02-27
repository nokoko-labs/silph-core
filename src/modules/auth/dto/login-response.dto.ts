import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { withOpenApiExample } from '@/common/zod-openapi';

/**
 * Response DTO for POST /auth/login.
 */
export const LoginResponseSchema = z.object({
  access_token: withOpenApiExample(
    z.string().optional().describe('JWT access token for Bearer authentication'),
    'eyJhbGc...',
  ),
  tenantSlug: z
    .string()
    .optional()
    .describe(
      'Tenant slug for initial redirect to /{tenantSlug}/dashboard; always present when access_token is returned',
    ),
  status: z.string().optional().describe('MFA status (e.g. MFA_REQUIRED)'),
  ticket: z.string().optional().describe('Temporary ticket for MFA verification'),
});

export type LoginResponsePayload = z.infer<typeof LoginResponseSchema>;

export class LoginResponseDto extends createZodDto(LoginResponseSchema) {}

/**
 * Response DTO for 403 MFA_REQUIRED.
 */
export const MfaRequiredResponseSchema = z.object({
  message: withOpenApiExample(z.literal('MFA_REQUIRED').describe('Error code'), 'MFA_REQUIRED'),
  ticket: z.string().describe('Temporary ticket for MFA verification'),
});

export class MfaRequiredResponseDto extends createZodDto(MfaRequiredResponseSchema) {}
