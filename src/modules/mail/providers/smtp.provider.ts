import { Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { EmailProvider } from '../interfaces/email-provider.interface';

export class SmtpProvider implements EmailProvider {
  private readonly logger = new Logger(SmtpProvider.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(
    host: string,
    port: number,
    user: string,
    pass: string,
    private readonly from: string,
  ) {
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });
  }

  getName(): string {
    return 'SMTP';
  }

  async send(
    to: string,
    subject: string,
    template: string,
    _context: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        html: template,
      });
      this.logger.log(`Email sent to ${to} via SMTP`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to} via SMTP`, error.stack);
      throw error;
    }
  }
}
