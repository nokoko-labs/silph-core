import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for routes that allow selection tokens (JWT with sub + email, no tenantId/role).
 * Used by RolesGuard to allow access when user has no role but has email (e.g. GET /tenants).
 */
export const ALLOW_SELECTION_TOKEN_KEY = 'allowSelectionToken';

/**
 * Marks a route as allowing selection tokens.
 * When present, RolesGuard allows access if the JWT has at least sub + email (no role/tenantId required).
 * Use exclusively for endpoints that work with tenant selection (e.g. GET /tenants).
 */
export const AllowSelectionToken = () => SetMetadata(ALLOW_SELECTION_TOKEN_KEY, true);
