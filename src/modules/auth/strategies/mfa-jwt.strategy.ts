import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class MfaJwtStrategy extends PassportStrategy(Strategy, 'mfa-jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('mfaToken'),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_MFA_SECRET') || configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; email: string; type: string }) {
    if (payload.type !== 'mfa') {
      throw new UnauthorizedException('Invalid token type');
    }
    return { userId: payload.sub, email: payload.email };
  }
}
