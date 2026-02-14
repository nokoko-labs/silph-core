import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly configService: ConfigService) {
    // Placeholder configuration for nodemailer
    // In a real scenario, these would come from configService
  }

  async sendResetPasswordEmail(email: string, token: string) {
    const resetUrl = `${this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000')}/reset-password?token=${token}`;

    const _mailOptions = {
      from: '"Silph Core" <noreply@silph-core.com>',
      to: email,
      subject: 'Password Reset Request',
      text: `To reset your password, please click on the following link: ${resetUrl}`,
      html: `<p>To reset your password, please click on the following link:</p><a href="${resetUrl}">${resetUrl}</a>`,
    };

    try {
      // For now, we just log it as it's a placeholder service
      this.logger.log(`Sending reset password email to ${email} with token ${token}`);

      // Uncomment the following line when SMTP is configured
      // await this.transporter.sendMail(mailOptions);

      return true;
    } catch (error) {
      this.logger.error(`Error sending email to ${email}`, error.stack);
      return false;
    }
  }
}
