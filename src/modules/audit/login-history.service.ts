import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';

@Injectable()
export class LoginHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(role: Role, tenantId: string) {
    const where = role === Role.SUPER_ADMIN ? {} : { tenantId };

    return this.prisma.loginHistory.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
