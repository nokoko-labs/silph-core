import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailProvider } from './interfaces/email-provider.interface';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject('EmailProvider') private readonly provider: EmailProvider,
  ) {}

  async send(to: string, subject: string, template: string, context: any = {}) {
    return this.provider.send(to, subject, template, context);
  }

  async sendResetPasswordEmail(email: string, token: string) {
    const resetUrl = `${this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    )}/reset-password?token=${token}`;

    const subject = 'Password Reset Request';
    const html = `<p>To reset your password, please click on the following link:</p><a href="${resetUrl}">${resetUrl}</a>`;

    try {
      this.logger.log(`Sending reset password email to ${email}`);
      await this.send(email, subject, html);
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
