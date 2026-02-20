import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const AuditLogResponseSchema = z.object({
  id: z.string().uuid().describe('Log UUID'),
  action: z.string().describe('Action name (e.g. CREATE_USER)'),
  entity: z.string().describe('Affected entity type'),
  entityId: z.string().describe('ID of the affected entity'),
  payload: z.any().describe('Action payload data'),
  userId: z.string().uuid().describe('Author user ID'),
  tenantId: z.string().uuid().nullable().describe('Tenant UUID'),
  createdAt: z.date().describe('Creation timestamp'),
});

export class AuditLogResponseDto extends createZodDto(AuditLogResponseSchema) {}
