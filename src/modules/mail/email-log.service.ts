import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { MeResponseDto } from '@/modules/auth/dto/me-response.dto';
import { EmailLogResponseDto } from './dto/email-log-response.dto';

@Injectable()
export class EmailLogService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: MeResponseDto): Promise<EmailLogResponseDto[]> {
    const where = user.role === Role.SUPER_ADMIN ? {} : { tenantId: user.tenantId };

    const logs = await this.prisma.emailLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return logs.map((log) => ({
      ...log,
      errorMessage: log.errorMessage ?? undefined,
      tenantId: log.tenantId ?? undefined,
    }));
  }
}
