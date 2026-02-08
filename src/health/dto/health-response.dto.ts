import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for GET /health response (Terminus format).
 * When status is 'ok', info contains each indicator result; when 'error', error/details are present.
 */
export class HealthResponseDto {
  @ApiProperty({
    description: 'Overall health status',
    enum: ['ok', 'error'],
    example: 'ok',
  })
  status!: 'ok' | 'error';

  @ApiProperty({
    description: 'Details of health indicators when status is ok',
    example: { database: { status: 'up' } },
    required: false,
  })
  info?: Record<string, { status: string }>;

  @ApiProperty({
    description: 'Error summary when status is error',
    example: { database: { status: 'down' } },
    required: false,
  })
  error?: Record<string, unknown>;

  @ApiProperty({
    description: 'Detailed indicator results when status is error',
    required: false,
  })
  details?: Record<string, unknown>;
}
