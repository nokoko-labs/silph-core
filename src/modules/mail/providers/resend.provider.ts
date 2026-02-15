import { Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { EmailProvider } from '../interfaces/email-provider.interface';

export class ResendProvider implements EmailProvider {
  private readonly logger = new Logger(ResendProvider.name);
  private readonly resend: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.resend = new Resend(apiKey);
  }

  async send(
    to: string,
    subject: string,
    template: string,
    _context: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.resend.emails.send({
        from: this.from,
        to,
        subject,
        html: template, // In a real scenario, template would be handled here
      });
      this.logger.log(`Email sent to ${to} via Resend`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to} via Resend`, error.stack);
      throw error;
    }
  }
}
