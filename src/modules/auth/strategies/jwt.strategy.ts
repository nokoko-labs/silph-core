import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload, type SelectionJwtPayload } from '../auth.service';

/** Payload from JWT: full (with tenantId) or selection token (sub + email only). */
type JwtPayloadOrSelection = JwtPayload | SelectionJwtPayload;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: JwtPayloadOrSelection): JwtPayloadOrSelection {
    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException('Invalid token payload');
    }
    // Selection token: no tenantId — allowed for GET /tenants and POST /auth/select-tenant
    if (!('tenantId' in payload) || payload.tenantId == null) {
      return payload;
    }
    // Full token: require role and status
    if (!payload.role || !payload.status) {
      throw new UnauthorizedException('Invalid token payload');
    }
    return payload;
  }
}
