import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailLogService } from './email-log.service';
import { EmailLogsController } from './email-logs.controller';
import { MailService } from './mail.service';
import { ResendProvider } from './providers/resend.provider';
import { SmtpProvider } from './providers/smtp.provider';

@Global()
@Module({
  controllers: [EmailLogsController],
  providers: [
    MailService,
    EmailLogService,
    {
      provide: 'EmailProvider',
      useFactory: (configService: ConfigService) => {
        const provider = configService.get<string>('EMAIL_PROVIDER', 'smtp');
        const from = configService.get<string>(
          'MAIL_FROM',
          '"Silph Core" <noreply@silph-core.com>',
        );

        if (provider === 'resend') {
          return new ResendProvider(configService.getOrThrow<string>('RESEND_API_KEY'), from);
        }

        return new SmtpProvider(
          configService.get<string>('SMTP_HOST', 'localhost'),
          configService.get<number>('SMTP_PORT', 587),
          configService.get<string>('SMTP_USER', ''),
          configService.get<string>('SMTP_PASS', ''),
          from,
        );
      },
      inject: [ConfigService],
    },
  ],
  exports: [MailService],
})
export class MailModule {}
