import {
  ConflictException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { Prisma, Role, Tenant } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
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

  async findAll(): Promise<Tenant[]> {
    return this.prisma.tenant.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
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

  async update(id: string, dto: UpdateTenantDto): Promise<Tenant> {
    await this.findOne(id); // Ensure tenant exists
    try {
      return await this.prisma.tenant.update({
        where: { id },
        data: {
          ...dto,
          config: dto.config ? (dto.config as unknown as Prisma.InputJsonValue) : undefined,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Tenant with slug already exists`);
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
}
