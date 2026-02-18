import { Test, type TestingModule } from '@nestjs/testing';
import { type EmailLog, Role } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { EmailLogService } from './email-log.service';

describe('EmailLogService', () => {
  let service: EmailLogService;
  let prismaService: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const prismaServiceMock = {
      emailLog: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailLogService,
        {
          provide: PrismaService,
          useValue: prismaServiceMock,
        },
      ],
    }).compile();

    service = module.get<EmailLogService>(EmailLogService);
    prismaService = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all logs for SUPER_ADMIN', async () => {
      const user = {
        sub: 'user-1',
        email: 'super@admin.com',
        role: Role.SUPER_ADMIN,
        tenantId: 'tenant-1',
      };

      await service.findAll(user);

      expect(prismaService.emailLog.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should filter by tenantId for ADMIN', async () => {
      const user = {
        sub: 'user-2',
        email: 'admin@tenant.com',
        role: Role.ADMIN,
        tenantId: 'tenant-2',
      };

      await service.findAll(user);

      expect(prismaService.emailLog.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-2' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should map null values to undefined in response', async () => {
      const user = {
        sub: 'user-1',
        email: 'super@admin.com',
        role: Role.SUPER_ADMIN,
        tenantId: 'tenant-1',
      };

      const mockLogs = [
        {
          id: 'log-1',
          to: 'test@example.com',
          subject: 'Test',
          status: 'SENT',
          errorMessage: null,
          sentAt: new Date(),
          tenantId: null,
          createdAt: new Date(),
        },
      ];

      prismaService.emailLog.findMany.mockResolvedValueOnce(mockLogs as unknown as EmailLog[]);

      const result = await service.findAll(user);

      expect(result[0].errorMessage).toBeUndefined();
      expect(result[0].tenantId).toBeUndefined();
    });
  });
});
