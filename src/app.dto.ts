import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { withOpenApiExample } from '@/common/zod-openapi';

/**
 * Schema for root GET / response (health check).
 */
export const HealthCheckSchema = z.object({
  status: withOpenApiExample(z.string().describe('Status message'), 'ok'),
  timestamp: withOpenApiExample(
    z.string().describe('Timestamp of the health check (ISO 8601)'),
    '2025-01-15T12:00:00.000Z',
  ),
});

export type HealthCheckPayload = z.infer<typeof HealthCheckSchema>;

/**
 * DTO for root health check; validation and OpenAPI from HealthCheckSchema.
 */
export class HealthCheckDto extends createZodDto(HealthCheckSchema) {}
