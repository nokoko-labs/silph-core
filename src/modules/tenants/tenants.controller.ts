import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { OwnershipGuard } from '@/common/guards/ownership.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { JwtPayload } from '@/modules/auth/auth.service';
import { AdminTenantResponseDto } from './dto/admin-tenant-response.dto';
import { CheckSlugResponseDto } from './dto/check-slug-response.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { FindAllTenantsQueryDto } from './dto/find-all-tenants-query.dto';
import { PaginatedTenantsResponseDto } from './dto/paginated-tenants-response.dto';
import { PublicTenantResponseDto } from './dto/public-tenant-response.dto';
import { TenantResponseDto } from './dto/tenant-response.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantsService } from './tenants.service';

@ApiTags('Tenants')
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @Public()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({
    summary: 'Create a new tenant (Public)',
    description:
      'Registers a new tenant with a slug and name. Automatically sets status to ACTIVE.',
  })
  @ApiBody({
    type: CreateTenantDto,
    description: 'Tenant data to create',
    examples: {
      acme: {
        summary: 'Acme Corp',
        value: { name: 'Acme Corp', slug: 'acme-corp' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Tenant created successfully', type: TenantResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Invalid input (e.g. slug with spaces or invalid characters)',
  })
  @ApiResponse({ status: 409, description: 'Tenant with same slug already exists' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Get('check-slug/:slug')
  @Public()
  @ApiOperation({
    summary: 'Check if a slug is available (Public)',
    description: 'Returns true if the slug is not taken by any existing tenant.',
  })
  @ApiResponse({
    status: 200,
    description: 'Availability status',
    type: CheckSlugResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid slug format' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async checkSlug(@Param('slug') slug: string): Promise<CheckSlugResponseDto> {
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new BadRequestException(
        'Invalid slug format. Use lowercase, numbers, and hyphens only.',
      );
    }
    const available = await this.tenantsService.isSlugAvailable(slug);
    return { available };
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({
    summary: 'List tenants (paginated)',
    description:
      'SUPER_ADMIN: all tenants. ADMIN: only their own tenant. Supports pagination, filtering by status, and sorting.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of tenants',
    type: PaginatedTenantsResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: FindAllTenantsQueryDto,
  ): Promise<PaginatedTenantsResponseDto> {
    return this.tenantsService.findAll(user, query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'Get tenant by id (Admin/Super Admin only)' })
  @ApiResponse({ status: 200, description: 'Tenant found', type: AdminTenantResponseDto })
  @ApiResponse({ status: 403, description: 'Forbidden - Access denied' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<AdminTenantResponseDto> {
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('Only active users can access this');
    }

    // Role.ADMIN can only access their own tenant
    if (user.role === Role.ADMIN && user.tenantId !== id) {
      throw new ForbiddenException(
        'Access denied: You can only access your own tenant information',
      );
    }

    // Role.SUPER_ADMIN bypasses restricted check (handled by RolesGuard allowing both, but logic here allows any id)

    return this.tenantsService.findOne(
      id,
      user.role as Role,
    ) as unknown as Promise<AdminTenantResponseDto>;
  }

  @Get('slug/:slug')
  @Public()
  @ApiOperation({
    summary: 'Get tenant by slug (Public)',
    description: 'Used during login flow to resolve tenant before credentials. No auth required.',
  })
  @ApiResponse({ status: 200, description: 'Tenant found', type: PublicTenantResponseDto })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async findBySlug(@Param('slug') slug: string): Promise<PublicTenantResponseDto> {
    return this.tenantsService.findPublicBySlug(slug);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, OwnershipGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiBearerAuth('BearerAuth')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ summary: 'Update a tenant' })
  @ApiBody({ type: UpdateTenantDto, description: 'Tenant data to update' })
  @ApiResponse({ status: 200, description: 'Tenant updated successfully', type: TenantResponseDto })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @ApiResponse({ status: 409, description: 'Tenant with same slug already exists' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TenantResponseDto> {
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('Only active users can access this');
    }
    return this.tenantsService.update(id, dto, user) as unknown as Promise<TenantResponseDto>;
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiBearerAuth('BearerAuth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a tenant (Super Admin only)' })
  @ApiResponse({ status: 204, description: 'Tenant deleted successfully' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('Only active users can access this');
    }
    return this.tenantsService.remove(id);
  }
}
