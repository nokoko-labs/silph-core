import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { User } from '@prisma/client';
import { Strategy } from 'passport-google-oauth20';
import { AuthService } from '../auth.service';

/**
 * Passport strategy for Google OAuth 2.0.
 * When GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_CALLBACK_URL are not set,
 * the strategy is still registered but validate() throws (so app can start without Google).
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
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
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: {
      id: string;
      emails?: Array<{ value: string; verified?: boolean }>;
      displayName?: string;
    },
  ): Promise<User> {
    const clientID = this.configService.get<string>('GOOGLE_CLIENT_ID');
    if (!clientID) {
      throw new UnauthorizedException('Google login is not configured');
    }
    return this.authService.findOrCreateFromGoogle(profile);
  }
}
