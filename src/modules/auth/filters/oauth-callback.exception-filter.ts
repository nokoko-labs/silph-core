import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { OAuthCallbackRedirectException } from '../exceptions/oauth-callback-redirect.exception';

type RequestWithOAuthState = Request & { oauthContextState?: { tenantSlug?: string } };

const OAUTH_CALLBACK_PATHS = ['/auth/google/callback', '/auth/github/callback'];

/**
 * Redirects OAuth callback errors to the frontend login page with ?error= so the
 * multi-tenant frontend can show a banner instead of raw JSON.
 * Only handles GET requests to /auth/google/callback and /auth/github/callback.
 */
@Catch(UnauthorizedException, NotFoundException, OAuthCallbackRedirectException)
@Injectable()
export class OAuthCallbackExceptionFilter implements ExceptionFilter {
  constructor(private readonly configService: ConfigService) {}

  catch(
    exception: UnauthorizedException | NotFoundException | OAuthCallbackRedirectException,
    host: ArgumentsHost,
  ): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<RequestWithOAuthState>();

    if (req.method !== 'GET' || !OAUTH_CALLBACK_PATHS.some((p) => req.path === p)) {
      // Not an OAuth callback: let Nest handle normally (JSON response)
      if (exception instanceof OAuthCallbackRedirectException) {
        res.status(exception.getStatus()).json(exception.getResponse());
      } else if (exception instanceof UnauthorizedException) {
        res.status(HttpStatus.UNAUTHORIZED).json(exception.getResponse());
      } else {
        res.status(HttpStatus.NOT_FOUND).json(exception.getResponse());
      }
      return;
    }

    const baseUrl =
      this.configService.get<string>('OAUTH_ERROR_REDIRECT_BASE_URL') ??
      this.configService.get<string>('FRONTEND_URL') ??
      'http://localhost:3001';

    let errorCode = 'auth_failed';
    let tenantSlug: string | undefined;

    if (exception instanceof OAuthCallbackRedirectException) {
      errorCode = exception.errorCode;
      tenantSlug = exception.tenantSlug;
    } else {
      tenantSlug = req.oauthContextState?.tenantSlug;
    }

    if (errorCode === 'signup_requires_tenant') {
      const url = `${baseUrl.replace(/\/$/, '')}/register-tenant?error=${encodeURIComponent(errorCode)}`;
      res.redirect(302, url);
      return;
    }

    const slug =
      typeof tenantSlug === 'string' &&
      tenantSlug.trim() &&
      tenantSlug !== 'auth' &&
      tenantSlug !== 'undefined' &&
      tenantSlug !== 'null'
        ? tenantSlug.trim()
        : undefined;
    const pathSegment = slug ? `/${slug}/login` : '/login';
    const url = `${baseUrl.replace(/\/$/, '')}${pathSegment}?error=${encodeURIComponent(errorCode)}`;
    res.redirect(302, url);
  }
}
