import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailStatus } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '@/database/prisma.service';
import { EmailProvider } from './interfaces/email-provider.interface';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject('EmailProvider') private readonly provider: EmailProvider,
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async send(
    to: string,
    subject: string,
    template: string,
    context: Record<string, unknown> = {},
    tenantIdOverride?: string,
  ) {
    const providerName = this.provider.getName();
    const tenantId = tenantIdOverride ?? this.cls.get<string>('tenantId');

    try {
      await this.provider.send(to, subject, template, context);

      // Async logging without blocking (fire and forget)
      this.prisma.emailLog
        .create({
          data: {
            to,
            subject,
            provider: providerName,
            status: EmailStatus.SENT,
            tenantId,
          },
        })
        .catch((err) => this.logger.error('Failed to create success EmailLog', err.stack));
    } catch (error) {
      this.logger.error(`Error sending email to ${to} via ${providerName}`, error.stack);

      // Async logging of failure
      this.prisma.emailLog
        .create({
          data: {
            to,
            subject,
            provider: providerName,
            status: EmailStatus.FAILED,
            errorMessage: error.message || String(error),
            tenantId,
          },
        })
        .catch((err) => this.logger.error('Failed to create failure EmailLog', err.stack));

      throw error;
    }
  }

  async sendResetPasswordEmail(
    email: string,
    token: string,
    tenantSlug: string,
    tenantId?: string,
  ) {
    const baseUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const resetUrl = `${baseUrl}/${tenantSlug}/reset-password?token=${token}`;

    const subject = 'Password Reset Request';
    const html = `<p>To reset your password, please click on the following link:</p><a href="${resetUrl}">${resetUrl}</a>`;

    try {
      this.logger.log(`Sending reset password email to ${email}`);
      await this.send(email, subject, html, {}, tenantId);
      return true;
    } catch (error) {
      this.logger.error(`Error sending email to ${email}`, error.stack);
      return false;
    }
  }

  async sendBackupCodeNotice(email: string) {
    const subject = 'Backup Codes Generated';
    const html = `<p>New MFA backup codes have been generated for your account. If you didn't do this, please contact support.</p>`;

    try {
      this.logger.log(`Sending backup code notice to ${email}`);
      await this.send(email, subject, html);
      return true;
    } catch (error) {
      this.logger.error(`Error sending backup code notice to ${email}`, error.stack);
      return false;
    }
  }
}
