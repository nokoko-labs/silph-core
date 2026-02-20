import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { JwtPayload } from '@/modules/auth/auth.service';
import { AuditLogService } from './audit-log.service';

import { AuditLogResponseDto } from './dto/audit-log-response.dto';

@ApiTags('Admin / Audit Logs')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Get all audit logs (Admin/Super Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'List of audit logs',
    type: AuditLogResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async findAll(@CurrentUser() user: JwtPayload): Promise<AuditLogResponseDto[]> {
    return this.auditLogService.findAll(user.role as Role, user.tenantId) as unknown as Promise<
      AuditLogResponseDto[]
    >;
  }
}
