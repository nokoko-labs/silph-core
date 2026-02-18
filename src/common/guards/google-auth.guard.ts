import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { getContextTenantSlug } from '@/modules/auth/oauth-context.helper';

/**
 * Guard that triggers Google OAuth 2.0 flow (redirect to Google or validate callback).
 * Passes tenantSlug from query param or x-tenant-slug header into OAuth state for Caso 3.
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const tenantSlug = getContextTenantSlug(req);
    return tenantSlug ? { state: { tenantSlug } } : {};
  }
}
