import { Module } from '@nestjs/common';
import { AuditInterceptor } from './audit.interceptor';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';
import { LoginHistoryController } from './login-history.controller';
import { LoginHistoryService } from './login-history.service';

@Module({
  controllers: [AuditLogController, LoginHistoryController],
  providers: [AuditLogService, AuditInterceptor, LoginHistoryService],
  exports: [AuditLogService, AuditInterceptor, LoginHistoryService],
})
export class AuditModule {}
