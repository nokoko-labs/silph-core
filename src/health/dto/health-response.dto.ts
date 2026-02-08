import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Schema for GET /health response (Terminus format).
 * When status is 'ok', info contains each indicator result; when 'error', error/details are present.
 */
export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'error']).describe('Overall health status'),
  info: z
    .record(z.object({ status: z.string() }))
    .optional()
    .describe('Details of health indicators when status is ok'),
  error: z.record(z.unknown()).optional().describe('Error summary when status is error'),
  details: z
    .record(z.unknown())
    .optional()
    .describe('Detailed indicator results when status is error'),
});

export type HealthResponsePayload = z.infer<typeof HealthResponseSchema>;

export class HealthResponseDto extends createZodDto(HealthResponseSchema) {}
