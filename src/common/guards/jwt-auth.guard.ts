import { AuthGuard } from '@nestjs/passport';

/**
 * Guard that protects routes with JWT Bearer token validation.
 */
export class JwtAuthGuard extends AuthGuard('jwt') {}
