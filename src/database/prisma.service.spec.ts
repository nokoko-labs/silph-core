import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  const mockConfigService = {
    get: jest.fn().mockReturnValue('dev'),
  };

  beforeEach(async () => {
    jest.spyOn(PrismaService.prototype, '$connect').mockResolvedValue(undefined);
    jest.spyOn(PrismaService.prototype, '$disconnect').mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined and instantiable without real DB connection', () => {
    expect(service).toBeDefined();
  });

  it('should call $connect on onModuleInit', async () => {
    await service.onModuleInit();
    expect(service.$connect).toHaveBeenCalled();
  });

  it('should call $disconnect on onModuleDestroy', async () => {
    await service.onModuleDestroy();
    expect(service.$disconnect).toHaveBeenCalled();
  });
});
