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

  async findAll(tenantId?: string): Promise<User[]> {
    return this.prisma.user.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id, deletedAt: null },
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
    try {
      return await this.prisma.user.update({
        where: { id, deletedAt: null },
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
