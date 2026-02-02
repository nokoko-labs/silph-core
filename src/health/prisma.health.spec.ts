import { HealthCheckError } from '@nestjs/terminus';
import { Test, type TestingModule } from '@nestjs/testing';
import { type DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaService } from '@/database/prisma.service';
import { PrismaHealthIndicator } from './prisma.health';

describe('PrismaHealthIndicator', () => {
  let indicator: PrismaHealthIndicator;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = mockDeep<PrismaService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaHealthIndicator, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    indicator = module.get<PrismaHealthIndicator>(PrismaHealthIndicator);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(indicator).toBeDefined();
  });

  it('should return status up when database responds', async () => {
    prisma.$queryRaw.mockResolvedValue([{ 1: 1 }]);

    const result = await indicator.isHealthy('database');

    expect(result).toEqual({ database: { status: 'up' } });
  });

  it('should throw HealthCheckError when database fails', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('Connection refused'));

    await expect(indicator.isHealthy('database')).rejects.toThrow(HealthCheckError);
  });
});
