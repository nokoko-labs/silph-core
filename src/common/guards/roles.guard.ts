import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import type { JwtPayload, SelectionJwtPayload } from '@/modules/auth/auth.service';
import { ALLOW_SELECTION_TOKEN_KEY } from '../decorators/allow-selection-token.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowSelectionToken = this.reflector.getAllAndOverride<boolean>(
      ALLOW_SELECTION_TOKEN_KEY,
      [context.getHandler(), context.getClass()],
    );
    const { user } = context
      .switchToHttp()
      .getRequest<{ user: JwtPayload | SelectionJwtPayload }>();

    if (!user || !user.sub || !user.email) {
      return false;
    }

    // Route allows selection token (e.g. GET /tenants): valid token with email is enough
    if (allowSelectionToken && (!('role' in user) || (user as JwtPayload).role == null)) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) {
      return true;
    }
    const payload = user as JwtPayload;
    if (!payload.role) {
      return false;
    }
    if (payload.role === Role.SUPER_ADMIN) {
      return true;
    }
    return requiredRoles.some((role) => payload.role === role);
  }
}
