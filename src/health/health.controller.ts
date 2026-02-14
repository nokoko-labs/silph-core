import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { RedisService } from '@/cache/redis.service';
import { Public } from '@/common/decorators/public.decorator';
import { PrismaService } from '@/database/prisma.service';
import { HealthResponseDto } from './dto/health-response.dto';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly prismaService: PrismaService,
    private readonly memory: MemoryHealthIndicator,
    private readonly redisService: RedisService,
  ) {}

  @Public()
  @Get('health')
  @HealthCheck()
  @ApiOperation({ summary: 'Comprehensive health check for the system' })
  @ApiResponse({
    status: 200,
    description: 'System is healthy',
    type: HealthResponseDto,
  })
  @ApiResponse({ status: 503, description: 'One or more health checks failed' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async check() {
    return this.health.check([
      // Database health
      () => this.prismaHealth.pingCheck('database', this.prismaService),
      // Redis/Cache health
      () =>
        this.redisService
          .get('health-check')
          .then(() => ({ redis: { status: 'up' } as const }))
          .catch(() => ({ redis: { status: 'down' } as const })),
      // Memory Heap (limit 150MB as requested)
      () => this.memory.checkHeap('memory_heap', 150 * 1024 * 1024),
      // Memory RSS
      () => this.memory.checkRSS('memory_rss', 300 * 1024 * 1024),
    ]);
  }
}
