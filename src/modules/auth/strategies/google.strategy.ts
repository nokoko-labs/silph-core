import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-google-oauth20';
import { RedisService } from '@/cache/redis.service';
import type { LoginResult } from '../auth.service';
import { AuthService } from '../auth.service';
import { createOAuthStateStore } from '../oauth-state.store';

type RequestWithOAuthContext = {
  oauthContextState?: { tenantSlug?: string };
};

/**
 * Passport strategy for Google OAuth 2.0.
 * When GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_CALLBACK_URL are not set,
 * the strategy is still registered but validate() throws (so app can start without Google).
 * Supports contextTenantSlug via state (query param or x-tenant-slug header on init).
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    redisService: RedisService,
  ) {
    const clientID = configService.get<string>('GOOGLE_CLIENT_ID') ?? '';
    const clientSecret = configService.get<string>('GOOGLE_CLIENT_SECRET') ?? '';
    const callbackURL =
      configService.get<string>('GOOGLE_CALLBACK_URL') ??
      'http://localhost:3000/auth/google/callback';
    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['email', 'profile'],
      passReqToCallback: true,
      store: createOAuthStateStore(redisService),
    });
  }

  async validate(
    req: RequestWithOAuthContext & {
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    _accessToken: string,
    _refreshToken: string,
    profile: {
      id: string;
      emails?: Array<{ value: string; verified?: boolean }>;
      displayName?: string;
    },
  ): Promise<LoginResult> {
    const clientID = this.configService.get<string>('GOOGLE_CLIENT_ID');
    if (!clientID) {
      throw new UnauthorizedException('Google login is not configured');
    }
    const contextTenantSlug = req.oauthContextState?.tenantSlug;
    const userAgent =
      typeof req.headers?.['user-agent'] === 'string'
        ? req.headers['user-agent']
        : Array.isArray(req.headers?.['user-agent'])
          ? req.headers['user-agent'][0]
          : undefined;
    return this.authService.processSocialProfile(
      profile,
      'google',
      contextTenantSlug,
      req.ip,
      userAgent,
    );
  }
}
