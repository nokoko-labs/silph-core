import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { getContextTenantSlug } from '@/modules/auth/oauth-context.helper';

/**
 * Guard that triggers GitHub OAuth 2.0 flow.
 * Passes tenantSlug from query param or x-tenant-slug header into OAuth state for Caso 3.
 */
@Injectable()
export class GitHubAuthGuard extends AuthGuard('github') {
  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const tenantSlug = getContextTenantSlug(req);
    return tenantSlug ? { state: { tenantSlug } } : {};
  }
}
