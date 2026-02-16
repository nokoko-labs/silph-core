import {
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
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { OwnershipGuard } from '@/common/guards/ownership.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { JwtPayload } from '@/modules/auth/auth.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { TenantResponseDto } from './dto/tenant-response.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantsService } from './tenants.service';

@ApiTags('tenants')
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @Public()
  @UsePipes(new ZodValidationPipe(CreateTenantDto))
  @ApiOperation({ summary: 'Create a new tenant (Public)' })
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

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'List all tenants (Super Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'List of tenants',
    type: TenantResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async findAll(): Promise<TenantResponseDto[]> {
    return this.tenantsService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, OwnershipGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiBearerAuth('BearerAuth')
  @ApiOperation({ summary: 'Get tenant by id' })
  @ApiResponse({ status: 200, description: 'Tenant found', type: TenantResponseDto })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<TenantResponseDto> {
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('Only active users can access this');
    }
    return this.tenantsService.findOne(id);
  }

  @Get('slug/:slug')
  @Public()
  @ApiOperation({
    summary: 'Get tenant by slug (Public)',
    description: 'Used during login flow to resolve tenant before credentials. No auth required.',
  })
  @ApiResponse({ status: 200, description: 'Tenant found', type: TenantResponseDto })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async findBySlug(
    @Param('slug') slug: string,
    @CurrentUser() user?: JwtPayload,
  ): Promise<TenantResponseDto> {
    if (user != null && user.status !== 'ACTIVE') {
      throw new ForbiddenException('Only active users can access this');
    }
    return this.tenantsService.findBySlug(slug);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, OwnershipGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiBearerAuth('BearerAuth')
  @UsePipes(new ZodValidationPipe(UpdateTenantDto))
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
    return this.tenantsService.update(id, dto);
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
