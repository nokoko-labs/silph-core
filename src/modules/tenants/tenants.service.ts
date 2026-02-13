import {
  ConflictException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { Prisma, Tenant } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';

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

  async findOne(id: string): Promise<Tenant> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id, deletedAt: null },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant with id "${id}" not found`);
    }
    return tenant;
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

  async update(id: string, dto: Prisma.TenantUpdateInput): Promise<Tenant> {
    await this.findOne(id); // Ensure tenant exists
    try {
      return await this.prisma.tenant.update({
        where: { id },
        data: dto,
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
