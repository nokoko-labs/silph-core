import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard that validates email + password (Local strategy) for login.
 */
@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}
