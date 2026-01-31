import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard that protects routes with JWT Bearer token validation.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
