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

/** JWT final token (single tenant or after tenant selection). */
export type LoginResultJwt = { access_token: string };

/** MFA required before issuing JWT. */
export type LoginResultMfa = { message: string; mfaToken: string };

/** Multi-tenant: user must select tenant; tempToken used to complete flow. */
export type LoginResultTenantSelection = {
  tenants: Array<{ id: string; name: string; slug: string }>;
  tempToken: string;
};

export type LoginResult = LoginResultJwt | LoginResultMfa | LoginResultTenantSelection;

import { AuditLogService } from '@/modules/audit/audit-log.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly mailService: MailService,
    private readonly auditLogService: AuditLogService,
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
   * Finds all users (across tenants) matching email and password.
   * Returns users with ACTIVE/PENDING status whose tenant is ACTIVE and not deleted.
   */
  async validateUserForTenants(
    email: string,
    password: string,
  ): Promise<Array<User & { tenant: Tenant }>> {
    const users = await this.prisma.user.findMany({
      where: {
        email,
        deletedAt: null,
        password: { not: null },
        status: { in: ['ACTIVE', 'PENDING'] },
        tenant: {
          deletedAt: null,
          status: 'ACTIVE',
        },
      },
      include: { tenant: true },
    });

    const matching: Array<User & { tenant: Tenant }> = [];
    for (const u of users) {
      if (u.password && (await bcrypt.compare(password, u.password))) {
        matching.push(u);
      }
    }
    return matching;
  }

  /**
   * Entry point for login: validates credentials and returns either
   * JWT, MFA_REQUIRED, or tenant selection (if user belongs to multiple tenants).
   */
  async attemptLogin(
    email: string,
    password: string,
    ip?: string,
    userAgent?: string,
  ): Promise<LoginResult> {
    const users = await this.validateUserForTenants(email, password);
    if (users.length === 0) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (users.length === 1) {
      return this.login(users[0], ip, userAgent);
    }

    // Multi-tenant: return tenant list + tempToken
    return this.createTenantSelectionResponse(users);
  }

  /**
   * Creates tempToken (JWT 5 min) and stores tenant-user mapping in Redis.
   * tempToken payload: { sub: sessionId, type: 'tenant_selection' }.
   */
  private createTenantSelectionResponse(
    users: Array<User & { tenant: Tenant }>,
  ): LoginResultTenantSelection {
    const sessionId = crypto.randomUUID();
    const tenantUsers = users.map((u) => ({
      userId: u.id,
      tenantId: u.tenantId,
      tenantName: u.tenant.name,
      tenantSlug: u.tenant.slug,
    }));

    const redisKey = `tenant_selection:${sessionId}`;
    this.redisService.set(redisKey, JSON.stringify(tenantUsers), 300); // 5 min TTL

    const tempToken = this.jwtService.sign(
      { sub: sessionId, type: 'tenant_selection' },
      { expiresIn: '5m' },
    );

    return {
      tenants: tenantUsers.map((t) => ({ id: t.tenantId, name: t.tenantName, slug: t.tenantSlug })),
      tempToken,
    };
  }

  /**
   * Exchanges tempToken + tenantId for final JWT.
   * Verifies that the userId (from session) belongs to the selected tenantId.
   */
  async selectTenant(
    tempToken: string,
    tenantId: string,
    ip?: string,
    userAgent?: string,
  ): Promise<LoginResultJwt | LoginResultMfa> {
    let payload: { sub: string; type?: string };
    try {
      payload = this.jwtService.verify<{ sub: string; type?: string }>(tempToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired temp token');
    }

    if (payload.type !== 'tenant_selection') {
      throw new UnauthorizedException('Invalid token type');
    }

    const sessionId = payload.sub;
    const redisKey = `tenant_selection:${sessionId}`;
    const data = await this.redisService.get(redisKey);

    if (!data) {
      throw new UnauthorizedException('Temp token expired or already used');
    }

    const tenantUsers: Array<{ userId: string; tenantId: string }> = JSON.parse(data);
    const selected = tenantUsers.find((t) => t.tenantId === tenantId);

    if (!selected) {
      throw new UnauthorizedException('Tenant not in your available tenants');
    }

    // Verify in DB that user exists and belongs to tenant
    const user = await this.prisma.user.findFirst({
      where: {
        id: selected.userId,
        tenantId: selected.tenantId,
        deletedAt: null,
      },
      include: { tenant: true },
    });

    if (!user) {
      throw new UnauthorizedException('User-tenant association no longer valid');
    }

    if (
      !['ACTIVE', 'PENDING'].includes(user.status) ||
      user.tenant.deletedAt ||
      user.tenant.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('Tenant or user is not active');
    }

    await this.redisService.del(redisKey); // One-time use

    // Single user: login returns JWT or MFA, never tenant selection
    return this.login(user, ip, userAgent) as Promise<LoginResultJwt | LoginResultMfa>;
  }

  /**
   * Universal method to process social profiles (Google, GitHub, etc.)
   * Uses Account table as source of truth for OAuth identities.
   * Implements Account Linking: links social identity to existing users by email.
   * Returns LoginResult: JWT, MFA_REQUIRED, or tenant selection (multi-tenant).
   *
   * Caso 3 - contextTenantSlug: Registro automático en Tenant específico vía URL/Contexto.
   * - Usuario NO existe + NO contextTenantSlug → UnauthorizedException
   * - Usuario NO existe + HAY contextTenantSlug → Crear User + Account en ese tenant
   * - Usuario EXISTE + HAY contextTenantSlug → Asociar a tenant si no es miembro, o login normal
   */
  async processSocialProfile(
    profile: {
      id: string;
      emails?: Array<{ value: string; verified?: boolean }>;
      displayName?: string;
    },
    provider: string,
    contextTenantSlug?: string,
    ip?: string,
    userAgent?: string,
  ): Promise<LoginResult> {
    const emailData = profile.emails?.[0];
    const email = emailData?.value;

    if (!email) {
      throw new BadRequestException(`${provider} profile has no email`);
    }

    if (!emailData?.verified) {
      throw new UnauthorizedException(`${provider} email is not verified`);
    }

    // 1. Búsqueda de Identidad: Account por provider + providerAccountId (sub del perfil social)
    const existingAccounts = await this.prisma.account.findMany({
      where: { provider, providerAccountId: profile.id },
      include: { user: { include: { tenant: true } } },
    });

    const eligibleUsers = existingAccounts
      .map((a) => a.user)
      .filter(
        (u) =>
          ['ACTIVE', 'PENDING'].includes(u.status) &&
          !u.tenant.deletedAt &&
          u.tenant.status === 'ACTIVE',
      );

    if (existingAccounts.length > 0 && eligibleUsers.length === 0) {
      throw new UnauthorizedException('User account is not active');
    }

    if (eligibleUsers.length === 1) {
      return this.login(eligibleUsers[0], ip, userAgent);
    }

    if (eligibleUsers.length > 1) {
      return this.createTenantSelectionResponse(eligibleUsers);
    }

    // 2. Account Linking por Email: no existe Account, buscar User por email
    const usersByEmail = await this.prisma.user.findMany({
      where: {
        email,
        deletedAt: null,
        status: { in: ['ACTIVE', 'PENDING'] },
        tenant: {
          deletedAt: null,
          status: 'ACTIVE',
        },
      },
      include: { tenant: true, accounts: true },
    });

    const usersToLink = usersByEmail.filter(
      (u) => !(u.accounts ?? []).some((a) => a.provider === provider),
    );

    if (usersByEmail.length > 0 && usersToLink.length === 0) {
      throw new UnauthorizedException(
        `This email is already linked to a different ${provider} account. Please sign in with that account.`,
      );
    }

    // 2a. Usuario EXISTE + contextTenantSlug: verificar membresía y asociar si aplica
    if (contextTenantSlug && usersToLink.length > 0) {
      const contextTenant = await this.prisma.tenant.findFirst({
        where: { slug: contextTenantSlug, deletedAt: null, status: 'ACTIVE' },
      });
      if (!contextTenant) {
        throw new NotFoundException(`Tenant with slug "${contextTenantSlug}" not found`);
      }
      const userInContextTenant = usersToLink.find((u) => u.tenantId === contextTenant.id);
      if (userInContextTenant) {
        await this.prisma.account.create({
          data: {
            userId: userInContextTenant.id,
            provider,
            providerAccountId: profile.id,
          },
        });
        return this.login(userInContextTenant, ip, userAgent);
      }
      // Usuario existe en otros tenants pero NO en contextTenant: crear User en contextTenant + link a todos
      const newUserInTenant = await this.createUserWithAccountInTenant(
        email,
        provider,
        profile.id,
        contextTenant.id,
      );
      await this.prisma.account.createMany({
        data: usersToLink.map((u) => ({
          userId: u.id,
          provider,
          providerAccountId: profile.id,
        })),
        skipDuplicates: true,
      });
      const allUsersForEmail = [...usersToLink, newUserInTenant];
      return this.createTenantSelectionResponse(allUsersForEmail);
    }

    if (usersToLink.length === 1) {
      await this.prisma.account.create({
        data: {
          userId: usersToLink[0].id,
          provider,
          providerAccountId: profile.id,
        },
      });
      return this.login(usersToLink[0], ip, userAgent);
    }

    if (usersToLink.length > 1) {
      await this.prisma.account.createMany({
        data: usersToLink.map((u) => ({
          userId: u.id,
          provider,
          providerAccountId: profile.id,
        })),
        skipDuplicates: true,
      });
      return this.createTenantSelectionResponse(usersToLink);
    }

    // 3. New User: sin Account ni User por email
    if (!contextTenantSlug) {
      throw new UnauthorizedException(
        'Sign up requires a tenant context. Please use a tenant-specific sign-in URL.',
      );
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: { slug: contextTenantSlug, deletedAt: null, status: 'ACTIVE' },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with slug "${contextTenantSlug}" not found`);
    }

    if (!tenant.enabledAuthProviders.includes(provider)) {
      throw new UnauthorizedException(
        `Authentication provider ${provider} is not enabled for this tenant`,
      );
    }

    const newUser = await this.createUserWithAccountInTenant(
      email,
      provider,
      profile.id,
      tenant.id,
    );

    return this.login(newUser, ip, userAgent);
  }

  /**
   * Creates a new User in the given tenant with Role.USER and links the OAuth Account.
   */
  private async createUserWithAccountInTenant(
    email: string,
    provider: string,
    providerAccountId: string,
    tenantId: string,
  ) {
    return this.prisma.user.create({
      data: {
        email,
        password: null,
        role: 'USER',
        status: 'ACTIVE',
        tenantId,
        emailVerified: true,
        accounts: {
          create: {
            provider,
            providerAccountId,
          },
        },
      },
      include: { tenant: true },
    });
  }

  async login(
    user: User & { tenant?: Tenant | null },
    ip?: string,
    userAgent?: string,
  ): Promise<LoginResult> {
    const tenant =
      user.tenant || (await this.prisma.tenant.findUnique({ where: { id: user.tenantId } }));

    // Check if MFA is required: Tenant requirement or User voluntary enablement
    const isMfaRequired = tenant?.mfaRequired || user.mfaEnabled;

    if (isMfaRequired) {
      // If MFA is required but not configured, we still issue the mfaToken
      const mfaToken = this.createMfaToken(user);
      return {
        message: 'MFA_REQUIRED',
        mfaToken,
      };
    }

    return this.loginSuccess(user, ip, userAgent);
  }

  private async loginSuccess(user: User, ip?: string, userAgent?: string) {
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

    // Record login history
    await this.recordLoginHistory(user.id, user.tenantId, ip, userAgent);

    return { access_token };
  }

  async recordLoginHistory(userId: string, tenantId: string, ip?: string, userAgent?: string) {
    await this.prisma.loginHistory.create({
      data: {
        userId,
        tenantId,
        ip,
        userAgent,
      },
    });
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

  async verifyMfa(
    userId: string,
    code: string,
    ip?: string,
    userAgent?: string,
  ): Promise<{ access_token: string }> {
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
    return this.loginSuccess(user, ip, userAgent);
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

  /**
   * Builds redirect URL for OAuth callback.
   * - JWT/MFA: stores result in Redis, returns URL with code
   * - Tenant selection: returns URL with tempToken and tenants
   */
  async buildOAuthRedirectUrl(loginResult: LoginResult): Promise<string> {
    const baseUrl = this.getOAuthSuccessRedirectUrl();
    if (!baseUrl) return '';

    const url = new URL(baseUrl);

    if ('tenants' in loginResult && 'tempToken' in loginResult) {
      url.searchParams.set('tempToken', loginResult.tempToken);
      url.searchParams.set('tenants', JSON.stringify(loginResult.tenants));
      return url.toString();
    }

    const code = randomBytes(32).toString('hex');
    const expiresIn = this.configService.get<number>('OAUTH_CODE_EXPIRES_IN', 60);
    await this.redisService.set(`oauth_code:${code}`, JSON.stringify(loginResult), expiresIn);
    url.searchParams.set('code', code);
    return url.toString();
  }

  async exchangeOAuthCode(code: string, ip?: string, userAgent?: string): Promise<LoginResult> {
    const key = `oauth_code:${code}`;
    const data = await this.redisService.get(key);

    if (!data) {
      throw new UnauthorizedException('Invalid or expired OAuth code');
    }

    await this.redisService.del(key);

    const parsed = JSON.parse(data) as LoginResult;

    if ('access_token' in parsed) return parsed;
    if ('message' in parsed && 'mfaToken' in parsed) return parsed;

    const userPayload = parsed as { userId?: string };
    if (userPayload.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userPayload.userId },
        include: { tenant: true },
      });
      if (user) return this.login(user, ip, userAgent);
    }

    throw new UnauthorizedException('Invalid OAuth code payload');
  }

  /**
   * Switches the current tenant context for a user.
   * Validates that the user (by email) exists in the target tenant and is ACTIVE/PENDING.
   * Also validates that the target tenant is ACTIVE and not deleted.
   */
  async switchTenant(
    userId: string,
    targetTenantId: string,
    ip?: string,
    userAgent?: string,
  ): Promise<LoginResult> {
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
    return this.login(targetUser, ip, userAgent);
  }

  async forgotPassword(email: string): Promise<{ originalToken?: string }> {
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

    // Save token to DB
    // We save it for the first user found; resetPassword will use email to update all
    await this.prisma.passwordResetToken.create({
      data: {
        token: hashedToken,
        expiresAt,
        userId: user.id,
      },
    });

    // Send email
    await this.mailService.sendResetPasswordEmail(user.email, token);

    return {
      originalToken: process.env.NODE_ENV !== 'production' ? token : undefined,
    };
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

    // Update password for ALL user records with this email (Global Identity)
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction(async (tx) => {
      // 1. Update all users sharing the same email
      await tx.user.updateMany({
        where: { email: resetToken.user.email },
        data: { password: hashedPassword },
      });

      // 2. Delete ALL recovery tokens for this email to prevent reuse
      await tx.passwordResetToken.deleteMany({
        where: { user: { email: resetToken.user.email } },
      });
    });

    // 3. Log the password reset
    await this.auditLogService.create({
      action: 'USER_PASSWORD_RESET',
      entity: 'User',
      entityId: resetToken.userId,
      payload: { email: resetToken.user.email, method: 'token_reset' },
      userId: 'SYSTEM',
      tenantId: null, // Affects all tenants
    });
  }
}
