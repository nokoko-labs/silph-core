import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard that triggers Google OAuth 2.0 flow (redirect to Google or validate callback).
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {}
