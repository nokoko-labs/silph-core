import * as crypto from 'node:crypto';
import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Tenant, User } from '@prisma/client';

import * as bcrypt from 'bcryptjs';
import { verify } from 'otplib';
import { RedisService } from '@/cache/redis.service';
import { PrismaService } from '@/database/prisma.service';
import { MailService } from '@/modules/mail/mail.service';

export type JwtPayload = {
  sub: string;
  email: string;
  role: string;
  tenantId: string;
  status: string;
};

export type LoginResult = { access_token: string } | { message: string; mfaToken: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly mailService: MailService,
  ) {}

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      include: { tenant: true, accounts: true },
    });
    if (
      !user ||
      !user.password ||
      !['ACTIVE', 'PENDING'].includes(user.status) ||
      user.tenant.deletedAt ||
      user.tenant.status !== 'ACTIVE'
    ) {
      return null;
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return null;
    }
    return user;
  }

  /**
   * Universal method to process social profiles (Google, GitHub, etc.)
   * Handles linking to existing accounts by email and tenantId, or creating new ones.
   */
  async processSocialProfile(
    profile: {
      id: string;
      emails?: Array<{ value: string; verified?: boolean }>;
      displayName?: string;
    },
    provider: string,
  ): Promise<User> {
    const emailData = profile.emails?.[0];
    const email = emailData?.value;

    if (!email) {
      throw new BadRequestException(`${provider} profile has no email`);
    }

    if (!emailData?.verified) {
      throw new UnauthorizedException(`${provider} email is not verified`);
    }

    // 1. Step 1: Search in Account table if a record exists with provider and providerAccountId
    const existingAccount = await this.prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId: profile.id,
        },
      },
      include: { user: { include: { tenant: true } } },
    });

    // Step 2: If it exists, return the associated User
    if (existingAccount) {
      const user = existingAccount.user;
      if (!['ACTIVE', 'PENDING'].includes(user.status)) {
        throw new UnauthorizedException('User account is not active');
      }
      if (user.tenant.deletedAt || user.tenant.status !== 'ACTIVE') {
        throw new UnauthorizedException('Tenant is not active or deleted');
      }
      return user;
    }

    // Step 3: If Account does not exist, search in User table by email and tenantId
    const defaultTenantId = this.configService.getOrThrow<string>('OAUTH_DEFAULT_TENANT_ID');
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: defaultTenantId, deletedAt: null },
    });

    if (!tenant || tenant.status !== 'ACTIVE') {
      throw new Error(
        `OAUTH_DEFAULT_TENANT_ID (${defaultTenantId}) does not exist, is deleted or is not ACTIVE`,
      );
    }

    // Rule 2: Verify in Tenant model if provider is included in enabledAuthProviders
    if (!tenant.enabledAuthProviders.includes(provider)) {
      throw new UnauthorizedException(
        `Authentication provider ${provider} is not enabled for this tenant`,
      );
    }

    const existingUser = await this.prisma.user.findFirst({
      where: { email, tenantId: defaultTenantId, deletedAt: null },
      include: { tenant: true },
    });

    if (existingUser) {
      // Rule 1: Link social identity to existing account if user exists
      if (!['ACTIVE', 'PENDING'].includes(existingUser.status)) {
        throw new UnauthorizedException('User account is not active');
      }

      await this.prisma.account.create({
        data: {
          userId: existingUser.id,
          provider,
          providerAccountId: profile.id,
        },
      });
      return existingUser;
    }

    // Rule 1: Create User first (with password: null) and then its Account if user does not exist
    const newUser = await this.prisma.user.create({
      data: {
        email,
        password: null,
        role: 'USER',
        tenantId: defaultTenantId,
        emailVerified: true,
        accounts: {
          create: {
            provider,
            providerAccountId: profile.id,
          },
        },
      },
      include: { tenant: true },
    });

    return newUser;
  }

  async login(user: User & { tenant?: Tenant | null }): Promise<LoginResult> {
    const tenant =
      user.tenant || (await this.prisma.tenant.findUnique({ where: { id: user.tenantId } }));

    // Check if MFA is required: Tenant requirement or User voluntary enablement
    const isMfaRequired = tenant?.mfaRequired || user.mfaEnabled;

    if (isMfaRequired) {
      // If MFA is required but not configured, we still issue the mfaToken
      // The frontend will decide if it shows verification or setup based on user state
      const mfaToken = this.createMfaToken(user);
      return {
        message: 'MFA_REQUIRED',
        mfaToken,
      };
    }

    return this.loginSuccess(user);
  }

  private loginSuccess(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      status: user.status,
    };
    const access_token = this.jwtService.sign(payload, {
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '7d'),
    });
    return { access_token };
  }

  createMfaToken(user: User): string {
    const payload = {
      sub: user.id,
      email: user.email,
      type: 'mfa',
    };
    // Use a short-lived token (5 min) for MFA challenge
    return this.jwtService.sign(payload, {
      expiresIn: '5m',
      // We can use the same secret or a dedicated one if configured
      secret:
        this.configService.get<string>('JWT_MFA_SECRET') ||
        this.configService.get<string>('JWT_SECRET'),
    });
  }

  async verifyMfa(userId: string, code: string): Promise<{ access_token: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });

    if (!user || !user.mfaSecret) {
      throw new UnauthorizedException('MFA not configured or user not found');
    }

    // Implement throttling (e.g., 5 attempts per 5 minutes)
    const throttleKey = `mfa_attempts:${userId}`;
    const attemptsStr = await this.redisService.get(throttleKey);
    const attempts = attemptsStr ? Number.parseInt(attemptsStr, 10) : 0;

    if (attempts >= 5) {
      throw new UnauthorizedException('Too many attempts. Please try again in a few minutes.');
    }

    const isValid = verify({
      token: code,
      secret: user.mfaSecret,
    });

    if (!isValid) {
      await this.redisService.set(throttleKey, (attempts + 1).toString(), 300); // 5 minutes TTL
      throw new UnauthorizedException('Invalid MFA code');
    }

    // Success: clear attempts and login
    await this.redisService.del(throttleKey);
    return this.loginSuccess(user);
  }

  /** URL to redirect after OAuth success (SPA); undefined = return JSON. */
  getOAuthSuccessRedirectUrl(requestedUrl?: string): string | undefined {
    const defaultUrl = this.configService.get<string>('OAUTH_SUCCESS_REDIRECT_URL');
    const urlToValidate = requestedUrl || defaultUrl;

    if (!urlToValidate) return undefined;

    if (this.validateRedirectUrl(urlToValidate)) {
      return urlToValidate;
    }

    return undefined;
  }

  validateRedirectUrl(url: string): boolean {
    const allowedDomains = this.configService
      .get<string>('ALLOWED_OAUTH_REDIRECT_DOMAINS', '')
      .split(',')
      .map((d) => d.trim())
      .filter((d) => d.length > 0);

    if (allowedDomains.length === 0) return false;

    try {
      const parsedUrl = new URL(url);
      return allowedDomains.some((domain) => {
        // Support both exact origin match and hostname match
        return (
          parsedUrl.origin === domain ||
          parsedUrl.hostname === domain ||
          (domain.startsWith('.') && parsedUrl.hostname.endsWith(domain))
        );
      });
    } catch (_e) {
      return false;
    }
  }

  async generateOAuthCode(user: User): Promise<string> {
    const code = randomBytes(32).toString('hex');
    const expiresIn = this.configService.get<number>('OAUTH_CODE_EXPIRES_IN', 60);

    const data = JSON.stringify({
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      status: user.status,
    });

    await this.redisService.set(`oauth_code:${code}`, data, expiresIn);
    return code;
  }

  async exchangeOAuthCode(code: string): Promise<LoginResult> {
    const key = `oauth_code:${code}`;
    const data = await this.redisService.get(key);

    if (!data) {
      throw new UnauthorizedException('Invalid or expired OAuth code');
    }

    await this.redisService.del(key);

    const userPayload = JSON.parse(data);
    const user = await this.prisma.user.findUnique({
      where: { id: userPayload.userId },
      include: { tenant: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.login(user); // This will handle MFA challenge if needed
  }

  /**
   * Switches the current tenant context for a user.
   * Validates that the user (by email) exists in the target tenant and is ACTIVE/PENDING.
   * Also validates that the target tenant is ACTIVE and not deleted.
   */
  async switchTenant(userId: string, targetTenantId: string): Promise<LoginResult> {
    // 1. Get current user's email
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!currentUser) {
      throw new UnauthorizedException('Current user not found');
    }

    // 2. Find user record in target tenant
    const targetUser = await this.prisma.user.findFirst({
      where: {
        email: currentUser.email,
        tenantId: targetTenantId,
        deletedAt: null,
      },
      include: { tenant: true },
    });

    // 3. Validation: User must exist in target tenant, not deleted, and tenant must be ACTIVE
    if (
      !targetUser ||
      !['ACTIVE', 'PENDING'].includes(targetUser.status) ||
      targetUser.tenant.deletedAt ||
      targetUser.tenant.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('Access to target tenant denied or tenant is not active');
    }

    // 4. Generate new token for the target user record
    return this.login(targetUser);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('User with this email does not exist');
    }

    // Generate a secure random token
    const token = crypto.randomBytes(32).toString('hex');
    // Hash the token for storage (using SHA256 for fast lookup vs bcrypt)
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    // Save token to DB (upsert if you want only one active token, or just create)
    // We'll just create a new one, old ones will expire or be ignored
    await this.prisma.passwordResetToken.create({
      data: {
        token: hashedToken,
        expiresAt,
        userId: user.id,
      },
    });

    // Send email
    await this.mailService.sendResetPasswordEmail(user.email, token);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    // Hash the incoming token to compare with DB
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token: hashedToken },
      include: { user: true },
    });

    if (!resetToken) {
      throw new BadRequestException('Invalid or expired token');
    }

    if (resetToken.expiresAt < new Date()) {
      await this.prisma.passwordResetToken.delete({ where: { id: resetToken.id } });
      throw new BadRequestException('Token has expired');
    }

    // Update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: resetToken.userId },
      data: { password: hashedPassword },
    });

    // Invalidate/Delete the token
    await this.prisma.passwordResetToken.delete({
      where: { id: resetToken.id },
    });
  }
}
