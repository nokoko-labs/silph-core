import { EmailStatus } from '@prisma/client';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const EmailLogResponseSchema = z.object({
  id: z.string().uuid().describe('Log UUID'),
  to: z.string().email().describe('Recipient email'),
  subject: z.string().describe('Email subject'),
  provider: z.string().describe('Email provider name'),
  status: z.nativeEnum(EmailStatus).describe('Email status'),
  errorMessage: z.string().optional().describe('Error message if failed'),
  sentAt: z.date().describe('When the email was sent'),
  tenantId: z.string().uuid().optional().describe('Tenant UUID'),
});

export class EmailLogResponseDto extends createZodDto(EmailLogResponseSchema) {}
