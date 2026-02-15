import { ApiProperty } from '@nestjs/swagger';
import { EmailStatus } from '@prisma/client';

export class EmailLogResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'Log UUID' })
  id: string;

  @ApiProperty({ example: 'user@example.com', description: 'Recipient email' })
  to: string;

  @ApiProperty({ example: 'Welcome to Silph Core', description: 'Email subject' })
  subject: string;

  @ApiProperty({ example: 'SMTP', description: 'Email provider name' })
  provider: string;

  @ApiProperty({ enum: EmailStatus, description: 'Email status' })
  status: EmailStatus;

  @ApiProperty({
    example: 'API Key expired',
    description: 'Error message if failed',
    required: false,
  })
  errorMessage?: string;

  @ApiProperty({ description: 'When the email was sent' })
  sentAt: Date;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Tenant UUID',
    required: false,
  })
  tenantId?: string;
}
