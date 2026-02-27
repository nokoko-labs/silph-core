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
import { Prisma, Role, Tenant, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { verify } from 'otplib';
import { RedisService } from '@/cache/redis.service';
import { PrismaService } from '@/database/prisma.service';
import { MailService } from '@/modules/mail/mail.service';
import { RegisterPayload } from './dto/register.dto';
import { OAuthCallbackRedirectException } from './exceptions/oauth-callback-redirect.exception';

/** Full JWT after tenant is known (login or select-tenant). */
export type JwtPayload = {
  sub: string;
  email: string;
  role: string;
  tenantId: string;
  status: string;
};

/** Selection token: JWT with sub + email only, no tenantId. Used when user must pick a tenant. */
export type SelectionJwtPayload = {
  sub: string;
  email: string;
  tenantId?: never;
  role?: never;
  status?: never;
};

/** Payload accepted by GET /tenants: full JWT or selection token (at least sub + email). */
export type JwtPayloadOrSelection = JwtPayload | SelectionJwtPayload;

/** JWT final token (single tenant or after tenant selection). tenantSlug is always set for frontend redirect to /${tenantSlug}/dashboard. */
export type LoginResultJwt = { access_token: string; tenantSlug: string };

/** MFA required before issuing JWT. */
export type LoginResultMfa = { message: string; mfaToken: string };

/** Multi-tenant: user must select tenant. access_token is a selection JWT (sub + email, no tenantId). */
export type LoginResultTenantSelection = {
  access_token: string;
  needsSelection: true;
  suggestedTenant?: string;
  tenants: Array<{ id: string; name: string; slug: string }>;
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
   * Uses bypassTenantId so CLS does not scope the query — critical for correct multi-tenant count at login.
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
        bypassTenantId: true,
      } as Prisma.UserWhereInput,
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
   * Resolves suggested tenant slug from login body context (tenantSlug or tenantId).
   * Used to set suggestedTenant in needsSelection response when user logged in from a tenant-specific form.
   */
  private async resolveSuggestedSlugFromContext(
    tenantSlug?: string,
    tenantId?: string,
  ): Promise<string | undefined> {
    if (tenantSlug?.trim()) return tenantSlug.trim();
    if (!tenantId) return undefined;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    });
    return tenant?.slug ?? undefined;
  }

  /**
   * Returns all active memberships (user + tenant) for an email.
   * Uses bypassTenantId so the result is not scoped by CLS tenantId — used to decide single vs multi-tenant login.
   */
  private async getMembershipsForEmail(email: string): Promise<Array<User & { tenant: Tenant }>> {
    return this.prisma.user.findMany({
      where: {
        email,
        deletedAt: null,
        status: { in: ['ACTIVE', 'PENDING'] },
        tenant: { deletedAt: null, status: 'ACTIVE' },
        bypassTenantId: true,
      } as Prisma.UserWhereInput,
      include: { tenant: true },
    });
  }

  /**
   * DEBUG: Cuenta TODAS las membresías (users) para un email sin filtros de tenant.
   * Usa $queryRaw para evitar la inyección de tenantId del PrismaService (CLS).
   * Endpoint temporal GET /auth/test-my-tenants.
   */
  async getMyTenantsCountForDebug(email: string): Promise<{ count: number; tenantIds: string[] }> {
    const rows = await this.prisma.$queryRaw<Array<{ tenantId: string }>>(
      Prisma.sql`SELECT "tenantId" FROM users WHERE email = ${email} AND "deletedAt" IS NULL`,
    );
    return {
      count: rows.length,
      tenantIds: rows.map((r) => r.tenantId),
    };
  }

  /**
   * Entry point for login: validates credentials and returns either
   * JWT, MFA_REQUIRED, or tenant selection (if user belongs to multiple tenants).
   * CRITICAL: If the user has more than one tenant, we NEVER return a JWT with tenantSlug;
   * we always return tenant selection so the frontend redirects to /select-tenant?token=...
   * When tenantSlug is provided, we only allow direct tenant login when the user has exactly one tenant.
   * When needsSelection is returned, suggestedTenant is set from tenantSlug or tenantId (body context) if that tenant is in the user's list.
   */
  async attemptLogin(
    email: string,
    password: string,
    tenantSlug?: string,
    tenantId?: string,
    ip?: string,
    userAgent?: string,
  ): Promise<LoginResult> {
    const users = await this.validateUserForTenants(email, password);
    if (users.length === 0) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Resolve suggested slug from body context (tenant-specific form) for needsSelection response
    const suggestedSlugFromContext = await this.resolveSuggestedSlugFromContext(
      tenantSlug,
      tenantId,
    );

    // Multi-tenant: never return JWT with tenantSlug; always require tenant selection
    if (users.length > 1) {
      return this.createTenantSelectionResponse(users, suggestedSlugFromContext);
    }

    // Single tenant: optional direct login by slug (validate slug matches user's tenant)
    if (tenantSlug) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug: tenantSlug },
      });
      if (tenant && users[0].tenantId === tenant.id) {
        return this.directTenantLogin(email, password, tenantSlug, ip, userAgent);
      }
    }

    return this.login(users[0], ip, userAgent);
  }

  /**
   * Direct Tenant Login: tenantSlug is provided → resolve tenant, find user by email+tenantId,
   * validate password and ACTIVE status, then issue JWT or MFA.
   */
  private async directTenantLogin(
    email: string,
    password: string,
    tenantSlug: string,
    ip?: string,
    userAgent?: string,
  ): Promise<LoginResultJwt | LoginResultMfa> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });

    if (!tenant || tenant.deletedAt || tenant.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid email or password');
    }

    const user = await this.prisma.user.findUnique({
      where: {
        email_tenantId: { email, tenantId: tenant.id },
      },
      include: { tenant: true },
    });

    if (
      !user ||
      !user.password ||
      user.status !== 'ACTIVE' ||
      user.deletedAt ||
      user.tenant.deletedAt ||
      user.tenant.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.login(user, ip, userAgent) as Promise<LoginResultJwt | LoginResultMfa>;
  }

  /**
   * Selection token: JWT with sub (first user id) + email only, no tenantId.
   * Frontend uses this token to call GET /tenants and POST /auth/select-tenant with chosen tenantId.
   * suggestedSlug: when login body had tenantSlug/tenantId and that tenant is in the user's list, include as suggestedTenant.
   */
  private createTenantSelectionResponse(
    users: Array<User & { tenant: Tenant }>,
    suggestedSlug?: string,
  ): LoginResultTenantSelection {
    const first = users[0];
    const selectionPayload: SelectionJwtPayload = {
      sub: first.id,
      email: first.email,
    };
    const access_token = this.jwtService.sign(selectionPayload, {
      expiresIn: '5m',
    });

    const tenants = users.map((u) => ({
      id: u.tenantId,
      name: u.tenant.name,
      slug: u.tenant.slug,
    }));
    const slugSet = new Set(tenants.map((t) => t.slug));
    const suggestedTenant = suggestedSlug && slugSet.has(suggestedSlug) ? suggestedSlug : undefined;

    return {
      access_token,
      needsSelection: true as const,
      ...(suggestedTenant !== undefined && { suggestedTenant }),
      tenants,
    };
  }

  /**
   * Exchanges selection token (or legacy tempToken) + tenantId for final JWT.
   * Accepts: (1) Selection JWT with sub + email, no tenantId; (2) legacy tempToken (Redis).
   */
  async selectTenant(
    token: string,
    tenantId: string,
    ip?: string,
    userAgent?: string,
  ): Promise<LoginResultJwt | LoginResultMfa> {
    let payload: { sub: string; type?: string; email?: string; tenantId?: string };
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Legacy: Redis-backed tempToken (type === 'tenant_selection')
    if (payload.type === 'tenant_selection') {
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
      await this.redisService.del(redisKey);
      return this.issueJwtOrMfa(user, ip, userAgent);
    }

    // Selection JWT: sub + email, no tenantId — find user by email + tenantId (bypass)
    if (!payload.email || payload.tenantId != null) {
      throw new UnauthorizedException('Invalid token type');
    }
    const user = await this.prisma.user.findFirst({
      where: {
        email: payload.email,
        tenantId,
        deletedAt: null,
        status: { in: ['ACTIVE', 'PENDING'] },
        tenant: { deletedAt: null, status: 'ACTIVE' },
        bypassTenantId: true,
      } as Prisma.UserWhereInput,
      include: { tenant: true },
    });
    if (!user) {
      throw new UnauthorizedException('Tenant not in your available tenants');
    }
    return this.issueJwtOrMfa(user, ip, userAgent);
  }

  /**
   * Universal method to process social profiles (Google, GitHub, etc.)
   * Uses Account table as source of truth for OAuth identities.
   * Implements Account Linking: links social identity to existing users by email.
   * Returns LoginResult: JWT, MFA_REQUIRED, or tenant selection (multi-tenant).
   *
   * Direct-tenant login (contextTenantSlug from OAuth state):
   * - If contextTenantSlug is provided: validate tenant first; then find user by provider id AND tenant slug → emit finalJwt.
   * - If no contextTenantSlug and user has multiple tenants → return selection JWT + tenant list.
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

    // Security: validate tenantSlug early when provided (before processing login)
    let contextTenant: { id: string; slug: string; enabledAuthProviders: string[] } | null = null;
    if (contextTenantSlug) {
      const tenant = await this.prisma.tenant.findFirst({
        where: { slug: contextTenantSlug, deletedAt: null, status: 'ACTIVE' },
        select: { id: true, slug: true, enabledAuthProviders: true },
      });
      if (!tenant) {
        throw new OAuthCallbackRedirectException(
          `Tenant with slug "${contextTenantSlug}" not found`,
          'auth_failed',
          contextTenantSlug,
        );
      }
      if (!tenant.enabledAuthProviders.includes(provider)) {
        throw new OAuthCallbackRedirectException(
          `Authentication provider ${provider} is not enabled for this tenant`,
          'auth_provider_disabled',
          contextTenantSlug,
        );
      }
      contextTenant = tenant;
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

    // Direct-tenant login: user exists and contextTenantSlug was provided → filter by tenant, emit finalJwt if single match
    if (contextTenant && eligibleUsers.length > 0) {
      const slug = contextTenant.slug;
      const usersInTenant = eligibleUsers.filter((u) => u.tenant.slug === slug);
      if (usersInTenant.length === 1) {
        return this.login(usersInTenant[0], ip, userAgent);
      }
      if (usersInTenant.length === 0 && eligibleUsers.length > 1) {
        return this.createTenantSelectionResponse(eligibleUsers, contextTenant.slug);
      }
    }

    if (eligibleUsers.length === 1) {
      return this.login(eligibleUsers[0], ip, userAgent);
    }

    if (eligibleUsers.length > 1) {
      return this.createTenantSelectionResponse(eligibleUsers, contextTenant?.slug);
    }

    // 2. Account Linking por Email: no existe Account, buscar User por email (bypass para ver todos los tenants)
    const usersByEmail = await this.prisma.user.findMany({
      where: {
        email,
        deletedAt: null,
        status: { in: ['ACTIVE', 'PENDING'] },
        tenant: {
          deletedAt: null,
          status: 'ACTIVE',
        },
        bypassTenantId: true,
      } as Prisma.UserWhereInput,
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

    // 2a. Usuario EXISTE + contextTenantSlug: verificar membresía y asociar si aplica (contextTenant ya validado arriba)
    if (contextTenant && usersToLink.length > 0) {
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
      return this.createTenantSelectionResponse(allUsersForEmail, contextTenant.slug);
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

    // 3. New User: sin Account ni User por email (contextTenant ya validado arriba)
    if (!contextTenant) {
      throw new OAuthCallbackRedirectException(
        'Sign up requires a tenant context. Please use a tenant-specific sign-in URL.',
        'signup_requires_tenant',
      );
    }

    const newUser = await this.createUserWithAccountInTenant(
      email,
      provider,
      profile.id,
      contextTenant.id,
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
    // Lógica de membresías: antes de firmar el JWT, verificar cuántos tenants tiene el usuario.
    // Si tiene más de uno, NUNCA emitir JWT con tenantId; devolver needsSelection + accessToken sin tenantId + tenants.
    const memberships = await this.getMembershipsForEmail(user.email);
    if (memberships.length > 1) {
      return this.createTenantSelectionResponse(memberships);
    }

    return this.issueJwtOrMfa(user, ip, userAgent);
  }

  /**
   * Resolves tenant, checks MFA, then issues JWT (with tenantSlug) or MFA_REQUIRED.
   * Used when the user-tenant pair is already determined (e.g. selectTenant, single-tenant login).
   */
  private async issueJwtOrMfa(
    user: User & { tenant?: Tenant | null },
    ip?: string,
    userAgent?: string,
  ): Promise<LoginResultJwt | LoginResultMfa> {
    const tenant =
      user.tenant || (await this.prisma.tenant.findUnique({ where: { id: user.tenantId } }));

    const isMfaRequired = tenant?.mfaRequired || user.mfaEnabled;
    if (isMfaRequired) {
      const mfaToken = this.createMfaToken(user);
      return { message: 'MFA_REQUIRED', mfaToken };
    }

    return this.loginSuccess(user, ip, userAgent);
  }

  private async loginSuccess(
    user: User & { tenant?: { slug: string } | null },
    ip?: string,
    userAgent?: string,
  ): Promise<LoginResultJwt> {
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

    const tenantSlug =
      user.tenant?.slug ??
      (
        await this.prisma.tenant.findUnique({
          where: { id: user.tenantId },
          select: { slug: true },
        })
      )?.slug;

    if (!tenantSlug?.trim()) {
      throw new BadRequestException('Tenant slug not found; cannot complete login');
    }

    return { access_token, tenantSlug: tenantSlug.trim() };
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
  ): Promise<LoginResultJwt> {
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

  /**
   * Base URL for frontend OAuth callback (token + tenantSlug in query).
   * Uses FRONTEND_URL or in dev falls back to http://localhost:3001.
   */
  getFrontendOAuthRedirectBaseUrl(): string | undefined {
    const base =
      this.configService.get<string>('FRONTEND_URL') ||
      (this.configService.get<string>('NODE_ENV') === 'dev' ? 'http://localhost:3001' : undefined);
    if (!base || !this.validateRedirectUrl(base)) return undefined;
    return base.replace(/\/$/, '');
  }

  /**
   * Resolves tenant slug from a JWT access token (decodes tenantId and looks up slug).
   */
  async getTenantSlugFromAccessToken(accessToken: string): Promise<string | null> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(accessToken);
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: payload.tenantId },
        select: { slug: true },
      });
      return tenant?.slug ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Builds the frontend redirect URL based on login result:
   * - 1 tenant (JWT): /${tenantSlug}/dashboard?token=...
   * - >1 tenants: /select-tenant?token=<selection JWT>
   * - 0 tenants: /register-tenant
   * Never includes tenant=undefined; slug is resolved from JWT when needed.
   */
  async buildFrontendRedirectUrl(loginResult: LoginResult): Promise<string> {
    const base = this.getFrontendOAuthRedirectBaseUrl() ?? 'http://localhost:3001';

    if (
      'access_token' in loginResult &&
      !('needsSelection' in loginResult && loginResult.needsSelection)
    ) {
      const slug =
        ('tenantSlug' in loginResult ? loginResult.tenantSlug : null) ??
        (await this.getTenantSlugFromAccessToken(loginResult.access_token));
      const isValidSlug = slug && slug !== 'undefined' && slug !== 'null';
      if (isValidSlug) {
        const url = new URL(`/${slug}/dashboard`, base);
        url.searchParams.set('token', loginResult.access_token);
        return url.toString();
      }
      const url = new URL('/select-tenant', base);
      url.searchParams.set('token', loginResult.access_token);
      return url.toString();
    }

    if ('needsSelection' in loginResult && loginResult.needsSelection && 'tenants' in loginResult) {
      const url = new URL('/select-tenant', base);
      url.searchParams.set('token', loginResult.access_token);
      url.searchParams.set('tenants', JSON.stringify(loginResult.tenants));
      if (loginResult.suggestedTenant) {
        url.searchParams.set('suggestedTenant', loginResult.suggestedTenant);
      }
      return url.toString();
    }

    if (
      'message' in loginResult &&
      loginResult.message === 'MFA_REQUIRED' &&
      'mfaToken' in loginResult
    ) {
      const url = new URL('/login', base);
      url.searchParams.set('mfaToken', loginResult.mfaToken);
      return url.toString();
    }

    const url = new URL('/register-tenant', base);
    return url.toString();
  }

  /**
   * @deprecated Use buildFrontendRedirectUrl(loginResult) to avoid tenant=undefined. Kept for backward compatibility.
   * Builds frontend callback URL with token and tenantSlug (for Next.js /auth/callback).
   */
  buildFrontendAuthCallbackUrl(accessToken: string, tenantSlug?: string): string {
    const base = this.getFrontendOAuthRedirectBaseUrl() ?? 'http://localhost:3001';
    const url = new URL('/auth/callback', base);
    url.searchParams.set('token', accessToken);
    if (tenantSlug && tenantSlug !== 'auth') {
      url.searchParams.set('tenantSlug', tenantSlug);
    }
    return url.toString();
  }

  validateRedirectUrl(url: string): boolean {
    const allowedDomains = this.configService
      .get<string>('ALLOWED_OAUTH_REDIRECT_DOMAINS', '')
      .split(',')
      .map((d) => d.trim())
      .filter((d) => d.length > 0);

    try {
      const parsedUrl = new URL(url);
      if (allowedDomains.length === 0) {
        return (
          this.configService.get<string>('NODE_ENV') === 'dev' && parsedUrl.hostname === 'localhost'
        );
      }
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
   * - Tenant selection: returns URL with access_token (selection JWT) and tenants
   */
  async buildOAuthRedirectUrl(loginResult: LoginResult): Promise<string> {
    const baseUrl = this.getOAuthSuccessRedirectUrl();
    if (!baseUrl) return '';

    const url = new URL(baseUrl);

    if ('tenants' in loginResult && 'needsSelection' in loginResult && loginResult.needsSelection) {
      url.searchParams.set('token', loginResult.access_token);
      url.searchParams.set('tenants', JSON.stringify(loginResult.tenants));
      if (loginResult.suggestedTenant) {
        url.searchParams.set('suggestedTenant', loginResult.suggestedTenant);
      }
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
   * Returns a new JWT with the target tenant's slug so the frontend can update the tenant-slug cookie.
   */
  async switchTenant(
    userId: string,
    targetTenantId: string,
    ip?: string,
    userAgent?: string,
  ): Promise<LoginResultJwt> {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!currentUser) {
      throw new UnauthorizedException('Current user not found');
    }

    const targetUser = await this.prisma.user.findFirst({
      where: {
        email: currentUser.email,
        tenantId: targetTenantId,
        deletedAt: null,
      },
      include: { tenant: true },
    });

    if (
      !targetUser ||
      !['ACTIVE', 'PENDING'].includes(targetUser.status) ||
      targetUser.tenant.deletedAt ||
      targetUser.tenant.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('Access to target tenant denied or tenant is not active');
    }

    return this.loginSuccess(targetUser, ip, userAgent);
  }

  /**
   * Multi-tenant forgot password: requires tenantSlug to resolve user by email+tenantId.
   * If user does not exist in that tenant, returns same success response (no email) to avoid enumeration.
   */
  async forgotPassword(email: string, tenantSlug: string): Promise<{ originalToken?: string }> {
    // Step 1: Resolve tenant by slug
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });

    if (!tenant || tenant.deletedAt || tenant.status !== 'ACTIVE') {
      throw new NotFoundException('Tenant not found');
    }

    // Step 2: Find user by composite key (email + tenantId)
    const user = await this.prisma.user.findUnique({
      where: {
        email_tenantId: { email, tenantId: tenant.id },
      },
    });

    // Step 3 & 4: If user exists, create token and send email (EmailLog will get tenantId from MailService)
    if (!user || user.deletedAt) {
      return {
        originalToken: undefined,
      };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    await this.prisma.passwordResetToken.create({
      data: {
        token: hashedToken,
        expiresAt,
        userId: user.id,
      },
    });

    await this.mailService.sendResetPasswordEmail(user.email, token, tenant.slug, tenant.id);

    return {
      originalToken: process.env.NODE_ENV !== 'production' ? token : undefined,
    };
  }

  /**
   * Resets password for the user linked to the token (single tenant-scoped user).
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
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

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedPassword },
      });
      await tx.passwordResetToken.deleteMany({
        where: { userId: resetToken.userId },
      });
    });

    await this.auditLogService.create({
      action: 'PASSWORD_RESET',
      entity: 'User',
      entityId: resetToken.user.id,
      payload: { email: resetToken.user.email, method: 'token_reset' },
      userId: 'SYSTEM',
      tenantId: resetToken.user.tenantId,
    });
  }

  /**
   * Public user registration.
   * - If tenantSlug matches an active tenant, joins as USER.
   * - If no slug or mismatch, creates a basic Tenant and joins as ADMIN.
   */
  async register(dto: RegisterPayload, ip?: string, userAgent?: string): Promise<LoginResult> {
    console.log(
      `[AuthService.register] New registration for: ${dto.email}, Workspace: ${dto.tenantSlug || dto.tenantName}`,
    );
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      let tenantId: string;
      let role: Role = 'USER';

      if (dto.tenantSlug) {
        const existingTenant = await tx.tenant.findFirst({
          where: { slug: dto.tenantSlug, deletedAt: null, status: 'ACTIVE' },
        });

        if (existingTenant) {
          tenantId = existingTenant.id;
        } else {
          const newTenant = await tx.tenant.create({
            data: {
              name: dto.tenantName || `${dto.name}'s Workspace`,
              slug: dto.tenantSlug,
              status: 'ACTIVE',
            },
          });
          tenantId = newTenant.id;
          role = 'ADMIN';
        }
      } else {
        const baseSlug =
          dto.tenantName?.toLowerCase().replace(/\s+/g, '-') ||
          dto.name.toLowerCase().replace(/\s+/g, '-');
        const finalSlug = `${baseSlug}-${crypto.randomBytes(4).toString('hex')}`;

        const newTenant = await tx.tenant.create({
          data: {
            name: dto.tenantName || `${dto.name}'s Workspace`,
            slug: finalSlug,
            status: 'ACTIVE',
          },
        });
        tenantId = newTenant.id;
        role = 'ADMIN';
      }

      return await tx.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          role,
          status: 'ACTIVE',
          tenantId,
          emailVerified: false,
        },
        include: { tenant: true },
      });
    });

    return this.login(user, ip, userAgent);
  }
}
