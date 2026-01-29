import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, type HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '@/database/prisma.service';

@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return this.getStatus(key, true, { status: 'up' });
    } catch {
      throw new HealthCheckError(
        'Database check failed',
        this.getStatus(key, false, { status: 'down' }),
      );
    }
  }
}
