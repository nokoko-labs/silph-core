import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { RedisService } from '@/cache/redis.service';
import type { LoginResult } from '../auth.service';
import { AuthService } from '../auth.service';
import { createOAuthStateStore } from '../oauth-state.store';

type RequestWithOAuthContext = {
  oauthContextState?: { tenantSlug?: string };
};

@Injectable()
export class GitHubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    redisService: RedisService,
  ) {
    const clientID = configService.get<string>('GITHUB_CLIENT_ID') ?? 'placeholder';
    const clientSecret = configService.get<string>('GITHUB_CLIENT_SECRET') ?? 'placeholder';
    const callbackURL =
      configService.get<string>('GITHUB_CALLBACK_URL') ??
      'http://localhost:3000/auth/github/callback';

    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['user:email'],
      passReqToCallback: true,
      store: createOAuthStateStore(redisService),
    });
  }

  async validate(
    req: RequestWithOAuthContext,
    _accessToken: string,
    _refreshToken: string,
    profile: {
      id: string;
      emails?: Array<{ value: string; verified?: boolean }>;
      displayName?: string;
      username?: string;
    },
  ): Promise<LoginResult> {
    const clientID = this.configService.get<string>('GITHUB_CLIENT_ID');
    if (!clientID || clientID === 'placeholder') {
      throw new UnauthorizedException('GitHub login is not configured');
    }

    const emails = profile.emails?.map((e) => ({
      value: e.value,
      verified: e.verified ?? false,
    }));

    const contextTenantSlug = req.oauthContextState?.tenantSlug;
    return this.authService.processSocialProfile(
      {
        id: profile.id,
        emails,
        displayName: profile.displayName ?? profile.username,
      },
      'github',
      contextTenantSlug,
    );
  }
}
