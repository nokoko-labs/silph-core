import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Schema for root GET / response (health check).
 */
export const HealthCheckSchema = z.object({
  status: z.string().describe('Status message'),
  timestamp: z.string().describe('Timestamp of the health check (ISO 8601)'),
});

export type HealthCheckPayload = z.infer<typeof HealthCheckSchema>;

/**
 * DTO for root health check; validation and OpenAPI from HealthCheckSchema.
 */
export class HealthCheckDto extends createZodDto(HealthCheckSchema) {}
