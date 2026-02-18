import { SetMetadata } from '@nestjs/common';

export interface AuditActionMetadata {
  action: string;
  entity: string;
}

export const AUDIT_ACTION_KEY = 'audit_action';

export const AuditAction = (metadata: AuditActionMetadata) =>
  SetMetadata(AUDIT_ACTION_KEY, metadata);
