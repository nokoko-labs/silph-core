import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { EmailStatus } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '@/database/prisma.service';
import { EmailProvider } from './interfaces/email-provider.interface';
import { MailService } from './mail.service';

describe('MailService', () => {
  let service: MailService;
  let emailProvider: jest.Mocked<EmailProvider>;
  let prismaService: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const emailProviderMock = {
      getName: jest.fn().mockReturnValue('TestProvider'),
      send: jest.fn().mockResolvedValue(undefined),
    };

    const prismaServiceMock = {
      emailLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const clsServiceMock = {
      get: jest.fn().mockReturnValue('tenant-1'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        {
          provide: 'EmailProvider',
          useValue: emailProviderMock,
        },
        {
          provide: PrismaService,
          useValue: prismaServiceMock,
        },
        {
          provide: ClsService,
          useValue: clsServiceMock,
        },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
    emailProvider = module.get('EmailProvider');
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('send', () => {
    it('should send an email and log success', async () => {
      await service.send('test@example.com', 'Subject', '<html></html>');

      expect(emailProvider.send).toHaveBeenCalledWith(
        'test@example.com',
        'Subject',
        '<html></html>',
        {},
      );
      expect(prismaService.emailLog.create).toHaveBeenCalledWith({
        data: {
          to: 'test@example.com',
          subject: 'Subject',
          provider: 'TestProvider',
          status: EmailStatus.SENT,
          tenantId: 'tenant-1',
        },
      });
    });

    it('should log failure if provider fails', async () => {
      const error = new Error('API Error');
      emailProvider.send.mockRejectedValueOnce(error);

      await expect(service.send('test@example.com', 'Subject', '<html></html>')).rejects.toThrow(
        'API Error',
      );

      expect(prismaService.emailLog.create).toHaveBeenCalledWith({
        data: {
          to: 'test@example.com',
          subject: 'Subject',
          provider: 'TestProvider',
          status: EmailStatus.FAILED,
          errorMessage: 'API Error',
          tenantId: 'tenant-1',
        },
      });
    });
  });
});
