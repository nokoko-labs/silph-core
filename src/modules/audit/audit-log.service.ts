import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';

export interface CreateAuditLogData {
  action: string;
  entity: string;
  entityId: string;
  payload: Prisma.InputJsonValue; // Changed type from unknown to Prisma.InputJsonValue
  userId: string;
  tenantId: string | null;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateAuditLogData) {
    return this.prisma.auditLog.create({
      data: {
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        payload: data.payload as Prisma.InputJsonValue,
        userId: data.userId,
        tenantId: data.tenantId,
      },
    });
  }

  async findAll(role: Role, tenantId: string) {
    const where = role === Role.SUPER_ADMIN ? {} : { tenantId };

    return this.prisma.auditLog.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
