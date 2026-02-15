import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { User } from '@prisma/client';
import { Strategy } from 'passport-github2';
import { AuthService } from '../auth.service';

@Injectable()
export class GitHubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
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
    });
  }

  async validate(_accessToken: string, _refreshToken: string, profile: any): Promise<User> {
    const clientID = this.configService.get<string>('GITHUB_CLIENT_ID');
    if (!clientID || clientID === 'placeholder') {
      throw new UnauthorizedException('GitHub login is not configured');
    }

    // GitHub profile emails might need to be normalized to match the expected structure in AuthService
    const emails = profile.emails?.map((e: any) => ({
      value: e.value,
      verified: e.verified || false,
    }));

    return this.authService.processSocialProfile(
      {
        id: profile.id,
        emails,
        displayName: profile.displayName || profile.username,
      },
      'github',
    );
  }
}
