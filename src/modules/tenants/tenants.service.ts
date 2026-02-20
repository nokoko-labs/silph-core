import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { Prisma, Role, Tenant } from '@prisma/client';
import { buildPaginationMeta } from '@/common/dto/pagination.dto';
import { PrismaService } from '@/database/prisma.service';
import { JwtPayload } from '@/modules/auth/auth.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import type { FindAllTenantsQuery } from './dto/find-all-tenants-query.dto';
import type { PaginatedTenantsResponse } from './dto/paginated-tenants-response.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

type TenantConfig = {
  public?: Record<string, unknown>;
  private?: {
    activeIntegrations?: string[];
    [key: string]: unknown;
  };
};

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTenantDto): Promise<Tenant> {
    try {
      return await this.prisma.tenant.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          status: 'ACTIVE',
          config: (dto.config as unknown as Prisma.InputJsonValue) || Prisma.JsonNull,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Tenant with slug "${dto.slug}" already exists`);
      }
      throw error;
    }
  }

  /**
   * List tenants with pagination, filtering and sorting.
   * CRITICAL: Only SUPER_ADMIN sees all tenants; ADMIN (and non–super-admin) see only their own tenant.
   */
  async findAll(
    currentUser: JwtPayload,
    query: FindAllTenantsQuery,
  ): Promise<PaginatedTenantsResponse> {
    const { page, limit, status, sortBy, sortOrder } = query;

    const where: Prisma.TenantWhereInput = { deletedAt: null };
    if (currentUser.role !== Role.SUPER_ADMIN) {
      where.id = currentUser.tenantId;
    }
    if (status != null) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.tenant.count({ where }),
    ]);

    const meta = buildPaginationMeta(total, page, limit);
    return { data, meta };
  }

  async findOne(id: string, role?: Role): Promise<Tenant | Record<string, unknown>> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
    });

    if (!tenant || tenant.status === 'DELETED') {
      throw new NotFoundException(`Tenant with id "${id}" not found`);
    }

    // Return full tenant for internal use if no role is provided
    if (!role) return tenant;

    const config = (tenant.config as unknown as TenantConfig) || {};

    if (role === 'SUPER_ADMIN') {
      return {
        ...tenant,
        config: {
          public: config.public || {},
          private: {
            ...config.private,
            activeIntegrations: config.private?.activeIntegrations || [],
          },
        },
      };
    }

    if (role === 'ADMIN') {
      return {
        ...tenant,
        config: {
          public: config.public || {},
          private: {
            activeIntegrations: config.private?.activeIntegrations || [],
          },
        },
      };
    }

    return tenant;
  }

  async findPublicBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: {
        slug,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        enabledAuthProviders: true,
        config: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with slug "${slug}" not found or is not active`);
    }

    // Explicitly select only the 'public' key from config
    const config = tenant.config as unknown as TenantConfig;
    return {
      ...tenant,
      config: {
        public: config?.public || {},
      },
    };
  }

  async findBySlug(slug: string): Promise<Tenant> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug, deletedAt: null },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant with slug "${slug}" not found`);
    }
    return tenant;
  }

  async update(
    id: string,
    dto: UpdateTenantDto,
    user: JwtPayload,
  ): Promise<Tenant | Record<string, unknown>> {
    // 1. Ownership Check: ADMIN can only update their own tenant
    if (user.role === Role.ADMIN && user.tenantId !== id) {
      throw new ForbiddenException('Access denied: You can only update your own tenant');
    }

    // 2. Fetch existing tenant to perform deep merge and validate existence
    const currentTenant = (await this.findOne(id)) as Tenant;

    // 3. Validation and Filtering
    let updateData: Prisma.TenantUpdateInput = { ...dto } as Prisma.TenantUpdateInput;

    // Slug is critical: only SUPER_ADMIN can change it
    if (user.role === Role.ADMIN && dto.slug) {
      const { slug: _slug, ...rest } = updateData as Prisma.TenantUpdateInput & { slug?: string };
      updateData = rest;
    }

    // Configuration filtering and deep merge
    if (dto.config) {
      const currentConfig = (currentTenant.config as unknown as TenantConfig) || {};
      const incomingConfig = dto.config as unknown as TenantConfig;
      let finalConfig: TenantConfig = { ...currentConfig };

      if (user.role === Role.ADMIN) {
        // ADMIN can only modify config.public
        finalConfig = {
          ...currentConfig,
          public: {
            ...(currentConfig.public || {}),
            ...(incomingConfig.public || {}),
          },
        };
      } else if (user.role === Role.SUPER_ADMIN) {
        // SUPER_ADMIN can modify everything (public and private)
        finalConfig = {
          ...currentConfig,
          public: {
            ...(currentConfig.public || {}),
            ...(incomingConfig.public || {}),
          },
          private: {
            ...(currentConfig.private || {}),
            ...(incomingConfig.private || {}),
          },
        };
      }

      updateData.config = finalConfig as unknown as Prisma.InputJsonValue;
    }

    try {
      const updated = await this.prisma.tenant.update({
        where: { id },
        data: updateData,
      });

      // 4. Return formatted response (no secrets to ADMIN)
      return this.findOne(updated.id, user.role as Role);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Tenant with this slug already exists');
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const tenant = await this.findOne(id); // Ensure tenant exists and is not deleted

    // Check for active users
    const activeUsersCount = await this.prisma.user.count({
      where: {
        tenantId: id,
        status: 'ACTIVE',
        deletedAt: null,
      },
    });

    if (activeUsersCount > 0) {
      throw new PreconditionFailedException(
        `Cannot delete tenant "${tenant.name}" because it has ${activeUsersCount} active users`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Soft delete tenant
      await tx.tenant.update({
        where: { id },
        data: {
          status: 'DELETED',
          deletedAt: new Date(),
        },
      });

      // 2. Soft delete all non-deleted users in this tenant
      await tx.user.updateMany({
        where: {
          tenantId: id,
          deletedAt: null,
        },
        data: {
          status: 'DELETED',
          deletedAt: new Date(),
        },
      });
    });
  }

  /**
   * Checks if a slug is available for a new tenant.
   * Returns true if NO tenant exists with this slug (even if deleted/inactive).
   */
  async isSlugAvailable(slug: string): Promise<boolean> {
    const count = await this.prisma.tenant.count({
      where: { slug: { equals: slug, mode: 'insensitive' } },
    });
    return count === 0;
  }
}
