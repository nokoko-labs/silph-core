import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { MeResponseDto } from '@/modules/auth/dto/me-response.dto';
import { EmailLogResponseDto } from './dto/email-log-response.dto';
import { EmailLogService } from './email-log.service';

@ApiTags('Admin / Email Logs')
@Controller('admin/email-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN)
@ApiBearerAuth('BearerAuth')
export class EmailLogsController {
  constructor(private readonly emailLogService: EmailLogService) {}

  @Get()
  @ApiOperation({ summary: 'Get all email logs (Admin/Super Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'List of email logs',
    type: EmailLogResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async findAll(@CurrentUser() user: MeResponseDto): Promise<EmailLogResponseDto[]> {
    return this.emailLogService.findAll(user);
  }
}
