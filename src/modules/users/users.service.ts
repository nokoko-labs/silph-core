import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '@/database/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto): Promise<User> {
    const hashedPassword = dto.password ? await bcrypt.hash(dto.password, 10) : null;

    try {
      return await this.prisma.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          tenantId: dto.tenantId,
          role: dto.role || 'USER',
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`User with email "${dto.email}" already exists in this tenant`);
      }
      throw error;
    }
  }

  async findAll(tenantId: string): Promise<User[]> {
    return this.prisma.user.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId?: string): Promise<User> {
    const where: Prisma.UserWhereUniqueInput = { id, deletedAt: null };
    if (tenantId) {
      // For multi-tenancy enforcement if needed at service level
      // Note: findUnique doesn't support additional filters in 'where' besides the unique key
      // using findFirst for combined filters
      const user = await this.prisma.user.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!user) {
        throw new NotFoundException(`User with id "${id}" not found in this tenant`);
      }
      return user;
    }

    const user = await this.prisma.user.findUnique({
      where,
    });
    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found`);
    }
    return user;
  }

  async findByEmailAndTenant(email: string, tenantId: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: {
        email_tenantId: {
          email,
          tenantId,
        },
        deletedAt: null,
      },
    });
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const data: Prisma.UserUpdateInput = { ...dto };

    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, 10);
    }

    try {
      return await this.prisma.user.update({
        where: { id },
        data,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`User with email "${dto.email}" already exists in this tenant`);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`User with id "${id}" not found`);
      }
      throw error;
    }
  }

  async remove(id: string): Promise<User> {
    const user = await this.findOne(id);

    // If deleting an ADMIN, check if it's the last one in the tenant
    if (user.role === 'ADMIN') {
      const adminCount = await this.prisma.user.count({
        where: {
          tenantId: user.tenantId,
          role: 'ADMIN',
          deletedAt: null,
        },
      });

      if (adminCount <= 1) {
        throw new ConflictException(
          'Cannot delete the last ADMIN of the tenant. Please delegate the role or delete the Tenant instead.',
        );
      }
    }

    try {
      return await this.prisma.user.update({
        where: { id },
        data: {
          status: 'DELETED',
          deletedAt: new Date(),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`User with id "${id}" not found`);
      }
      throw error;
    }
  }
}
