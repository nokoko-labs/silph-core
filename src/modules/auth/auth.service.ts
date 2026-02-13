import { randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { RedisService } from '@/cache/redis.service';
import { PrismaService } from '@/database/prisma.service';

export type JwtPayload = {
  sub: string;
  email: string;
  role: string;
  tenantId: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!user || !user.password) {
      return null;
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return null;
    }
    return user;
  }

  /**
   * Find user by Google account, link to existing user by email, or create a new user and account.
   * New users are assigned to the default tenant (OAUTH_DEFAULT_TENANT_ID).
   */
  async findOrCreateFromGoogle(profile: {
    id: string;
    emails?: Array<{ value: string; verified?: boolean }>;
    displayName?: string;
  }): Promise<User> {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      throw new Error('Google profile has no email');
    }

    // 1. Check if we already have an account for this Google profile
    const existingAccount = await this.prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'google',
          providerAccountId: profile.id,
        },
      },
      include: { user: true },
    });

    if (existingAccount) {
      return existingAccount.user;
    }

    // 2. No account found. Check if a user with this email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      // Link existing user to Google account
      await this.prisma.account.create({
        data: {
          userId: existingUser.id,
          provider: 'google',
          providerAccountId: profile.id,
        },
      });
      return existingUser;
    }

    // 3. New user and new account
    const defaultTenantId = this.configService.getOrThrow<string>('OAUTH_DEFAULT_TENANT_ID');
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: defaultTenantId },
    });
    if (!tenant) {
      throw new Error(`OAUTH_DEFAULT_TENANT_ID (${defaultTenantId}) does not exist`);
    }

    const newUser = await this.prisma.user.create({
      data: {
        email,
        password: null,
        role: 'USER',
        tenantId: defaultTenantId,
        accounts: {
          create: {
            provider: 'google',
            providerAccountId: profile.id,
          },
        },
      },
    });

    return newUser;
  }

  login(user: User): { access_token: string } {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };
    const access_token = this.jwtService.sign(payload, {
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '7d'),
    });
    return { access_token };
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
    });

    await this.redisService.set(`oauth_code:${code}`, data, expiresIn);
    return code;
  }

  async exchangeOAuthCode(code: string): Promise<{ access_token: string }> {
    const key = `oauth_code:${code}`;
    const data = await this.redisService.get(key);

    if (!data) {
      throw new UnauthorizedException('Invalid or expired OAuth code');
    }

    await this.redisService.del(key);

    const userPayload = JSON.parse(data);
    const payload: JwtPayload = {
      sub: userPayload.userId,
      email: userPayload.email,
      role: userPayload.role,
      tenantId: userPayload.tenantId,
    };

    const access_token = this.jwtService.sign(payload, {
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '7d'),
    });

    return { access_token };
  }
}
