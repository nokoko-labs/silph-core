import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const LoginHistoryResponseSchema = z.object({
  id: z.string().uuid().describe('History record UUID'),
  userId: z.string().uuid().describe('User UUID'),
  tenantId: z.string().uuid().describe('Tenant UUID'),
  ip: z.string().nullable().describe('IP address of the requester'),
  userAgent: z.string().nullable().describe('User Agent of the requester'),
  createdAt: z.date().describe('Creation timestamp'),
});

export class LoginHistoryResponseDto extends createZodDto(LoginHistoryResponseSchema) {}
