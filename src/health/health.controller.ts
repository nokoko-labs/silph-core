import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthCheckService } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check with DB status' })
  @ApiResponse({ status: 200, description: 'Application and database are healthy' })
  @ApiResponse({ status: 503, description: 'One or more health checks failed' })
  check() {
    return this.health.check([() => this.prismaHealth.isHealthy('database')]);
  }
}
