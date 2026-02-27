import { ArgumentsHost, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuthCallbackRedirectException } from '../exceptions/oauth-callback-redirect.exception';
import { OAuthCallbackExceptionFilter } from './oauth-callback.exception-filter';

describe('OAuthCallbackExceptionFilter', () => {
  let filter: OAuthCallbackExceptionFilter;
  let configService: jest.Mocked<Pick<ConfigService, 'get'>>;
  let res: { redirect: jest.Mock; status: jest.Mock; json: jest.Mock };
  let getRequest: () => {
    method: string;
    path: string;
    oauthContextState?: { tenantSlug?: string };
  };

  beforeEach(() => {
    configService = { get: jest.fn().mockReturnValue('http://localhost:3001') };
    filter = new OAuthCallbackExceptionFilter(configService as ConfigService);
    res = {
      redirect: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    getRequest = () => ({ method: 'GET', path: '/auth/google/callback' });
  });

  function createHost(): ArgumentsHost {
    return {
      switchToHttp: () => ({
        getResponse: () => res,
        getRequest,
      }),
    } as unknown as ArgumentsHost;
  }

  it('should redirect to frontend login with tenantSlug and error when OAuthCallbackRedirectException on callback path', () => {
    const exception = new OAuthCallbackRedirectException(
      'Provider not enabled',
      'auth_provider_disabled',
      'acme',
    );
    filter.catch(exception, createHost());

    expect(res.redirect).toHaveBeenCalledWith(
      302,
      'http://localhost:3001/acme/login?error=auth_provider_disabled',
    );
    expect(configService.get).toHaveBeenCalledWith('OAUTH_ERROR_REDIRECT_BASE_URL');
  });

  it('should use OAUTH_ERROR_REDIRECT_BASE_URL when set', () => {
    configService.get.mockImplementation((key: string) =>
      key === 'OAUTH_ERROR_REDIRECT_BASE_URL' ? 'https://app.example.com' : undefined,
    );
    const exception = new OAuthCallbackRedirectException(
      'Provider not enabled',
      'auth_provider_disabled',
      'acme',
    );
    filter.catch(exception, createHost());

    expect(res.redirect).toHaveBeenCalledWith(
      302,
      'https://app.example.com/acme/login?error=auth_provider_disabled',
    );
  });

  it('should redirect to /register-tenant when errorCode is signup_requires_tenant', () => {
    const exception = new OAuthCallbackRedirectException(
      'Sign up requires a tenant context.',
      'signup_requires_tenant',
    );
    filter.catch(exception, createHost());

    expect(res.redirect).toHaveBeenCalledWith(
      302,
      'http://localhost:3001/register-tenant?error=signup_requires_tenant',
    );
  });

  it('should use /login without tenant segment when tenantSlug is missing', () => {
    const exception = new OAuthCallbackRedirectException('Auth failed', 'auth_failed');
    filter.catch(exception, createHost());

    expect(res.redirect).toHaveBeenCalledWith(302, 'http://localhost:3001/login?error=auth_failed');
  });

  it('should use req.oauthContextState.tenantSlug for UnauthorizedException on callback', () => {
    getRequest = () => ({
      method: 'GET',
      path: '/auth/google/callback',
      oauthContextState: { tenantSlug: 'my-tenant' },
    });
    const exception = new UnauthorizedException('Google login is not configured');
    filter.catch(exception, createHost());

    expect(res.redirect).toHaveBeenCalledWith(
      302,
      'http://localhost:3001/my-tenant/login?error=auth_failed',
    );
  });

  it('should return JSON response when path is not OAuth callback', () => {
    getRequest = () => ({ method: 'GET', path: '/auth/login' });
    const exception = new OAuthCallbackRedirectException(
      'Provider not enabled',
      'auth_provider_disabled',
      'acme',
    );
    filter.catch(exception, createHost());

    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(res.json).toHaveBeenCalled();
  });
});
