import { AuthGuard } from '@nestjs/passport';

/**
 * Guard that validates email + password (Local strategy) for login.
 */
export class LocalAuthGuard extends AuthGuard('local') {}
