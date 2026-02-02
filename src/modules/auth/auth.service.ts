import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
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
   * Find user by Google ID or email, or create a new user for OAuth sign-in.
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
    const existingByGoogleId = await this.prisma.user.findUnique({
      where: { googleId: profile.id },
    });
    if (existingByGoogleId) {
      return existingByGoogleId;
    }
    const existingByEmail = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingByEmail) {
      // Link existing account to Google (allow password users to also use Google)
      await this.prisma.user.update({
        where: { id: existingByEmail.id },
        data: { googleId: profile.id },
      });
      return this.prisma.user.findUniqueOrThrow({ where: { id: existingByEmail.id } });
    }
    const defaultTenantId = this.configService.getOrThrow<string>('OAUTH_DEFAULT_TENANT_ID');
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: defaultTenantId },
    });
    if (!tenant) {
      throw new Error(`OAUTH_DEFAULT_TENANT_ID (${defaultTenantId}) does not exist`);
    }
    return this.prisma.user.create({
      data: {
        email,
        googleId: profile.id,
        password: null,
        role: 'USER',
        tenantId: defaultTenantId,
      },
    });
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
  getOAuthSuccessRedirectUrl(): string | undefined {
    return this.configService.get<string>('OAUTH_SUCCESS_REDIRECT_URL');
  }
}
