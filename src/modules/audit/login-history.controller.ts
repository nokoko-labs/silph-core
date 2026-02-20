import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { JwtPayload } from '@/modules/auth/auth.service';
import { LoginHistoryResponseDto } from './dto/login-history-response.dto';
import { LoginHistoryService } from './login-history.service';

@ApiTags('Admin / Login History')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/login-history')
export class LoginHistoryController {
  constructor(private readonly loginHistoryService: LoginHistoryService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Get login history (Admin/Super Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'List of login history records',
    type: LoginHistoryResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async findAll(@CurrentUser() user: JwtPayload): Promise<LoginHistoryResponseDto[]> {
    return this.loginHistoryService.findAll(user.role as Role, user.tenantId) as unknown as Promise<
      LoginHistoryResponseDto[]
    >;
  }
}
