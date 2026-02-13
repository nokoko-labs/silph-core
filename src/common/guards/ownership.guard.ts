import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { JwtPayload } from '@/modules/auth/auth.service';

/**
 * Guard that verifies if the user has access to a specific tenant's resource.
 * SUPER_ADMIN is exempt from this check.
 * ADMINs and USERs can only access resources belonging to their own tenantId.
 */
@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: JwtPayload = request.user;

    if (!user) {
      return false;
    }

    // SUPER_ADMIN can access everything
    if (user.role === Role.SUPER_ADMIN) {
      return true;
    }

    // Identify tenantId from request (either from Params or Body)
    const tenantId = request.params.id || request.params.tenantId || request.body.tenantId;

    if (!tenantId) {
      // If no tenantId is found in the resource request, we might be listing all resources
      // but in a multi-tenant system, this should usually be filtered by the service.
      // For specific resource access (GET :id, PATCH :id, DELETE :id), the ID is usually the tenantId or the resource's tenantId.
      return true;
    }

    if (user.tenantId !== tenantId) {
      throw new ForbiddenException('You do not have access to this tenant resource');
    }

    return true;
  }
}
