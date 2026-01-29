import { HealthCheckService } from '@nestjs/terminus';
import { Test, type TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './prisma.health';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: HealthCheckService;

  const mockHealthResult = {
    status: 'ok',
    info: { database: { status: 'up' } },
    error: {},
    details: { database: { status: 'up' } },
  };

  beforeEach(async () => {
    const mockHealth = {
      check: jest.fn().mockResolvedValue(mockHealthResult),
    };
    const mockPrismaHealth = {
      isHealthy: jest.fn().mockResolvedValue({ database: { status: 'up' } }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: mockHealth },
        { provide: PrismaHealthIndicator, useValue: mockPrismaHealth },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthCheckService = module.get<HealthCheckService>(HealthCheckService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return health check result with status ok and database up', async () => {
    const result = await controller.check();

    expect(result).toEqual(mockHealthResult);
    expect(result.status).toBe('ok');
    expect(result.info?.database?.status).toBe('up');
    expect(healthCheckService.check).toHaveBeenCalled();
  });
});
