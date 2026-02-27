import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Thrown when OAuth callback should redirect the user to the frontend login page
 * with an error (e.g. provider disabled for tenant). The exception filter uses
 * tenantSlug and errorCode to build the redirect URL so the frontend can show a banner.
 */
export class OAuthCallbackRedirectException extends HttpException {
  constructor(
    message: string,
    public readonly errorCode: string,
    public readonly tenantSlug?: string,
  ) {
    super({ message, errorCode, tenantSlug }, HttpStatus.UNAUTHORIZED);
  }
}
