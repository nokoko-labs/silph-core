import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { PrismaService } from '@/database/prisma.service';
import { EmailLogResponseDto } from './dto/email-log-response.dto';

@ApiTags('Admin / Email Logs')
@Controller('admin/email-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
@ApiBearerAuth('BearerAuth')
export class EmailLogsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Get all email logs (Super Admin only)' })
  @ApiResponse({ status: 200, type: [EmailLogResponseDto] })
  async findAll(): Promise<EmailLogResponseDto[]> {
    const logs = await this.prisma.emailLog.findMany({
      orderBy: { sentAt: 'desc' },
      take: 100,
    });

    return logs.map((log) => ({
      ...log,
      errorMessage: log.errorMessage ?? undefined,
      tenantId: log.tenantId ?? undefined,
    }));
  }
}
