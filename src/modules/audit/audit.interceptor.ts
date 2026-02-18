import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { JwtPayload } from '@/modules/auth/auth.service';
import { AuditLogService } from './audit-log.service';
import { AUDIT_ACTION_KEY, AuditActionMetadata } from './decorators/audit-action.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly blacklist = ['/auth/'];
  private readonly sensitiveFields = [
    'password',
    'newPassword',
    'token',
    'tempToken',
    'accessToken',
    'refreshToken',
  ];

  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogService: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const url = request.url;

    // 1. Blacklist Check: Completely ignore /auth/ endpoints
    if (this.blacklist.some((path) => url.startsWith(path))) {
      return next.handle();
    }

    // 2. Only intercept write operations (POST, PATCH, PUT, DELETE)
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const metadata = this.reflector.getAllAndOverride<AuditActionMetadata>(AUDIT_ACTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    return next.handle().pipe(
      tap(async (response) => {
        const user = request.user as JwtPayload;

        // 3. Only Authenticated Users: If no user/tenant, do nothing
        if (!user || !user.sub || !user.tenantId) {
          return;
        }

        const action = metadata?.action || `${method}_${url.split('/')[1].toUpperCase()}`;
        const entity = metadata?.entity || url.split('/')[1];

        // Try to extract entityId from response or request params
        const entityId =
          response?.id ||
          request.params?.id ||
          request.params?.uuid ||
          Object.values(request.params)[0]?.toString() ||
          'N/A';

        // 4. Data Sanitization
        // 4. Data Sanitization - now sanitizing the response body
        // const sanitizedPayload = this.sanitize(request.body); // This line is removed as payload now comes from responseBody

        await this.auditLogService.create({
          action,
          entity,
          entityId,
          payload: this.sanitize(response) as Prisma.InputJsonValue,
          userId: user.sub,
          tenantId: user.tenantId,
        });
      }),
    );
  }

  private sanitize(data: unknown): unknown {
    if (!data || typeof data !== 'object') return data;

    const sanitized = Array.isArray(data) ? [...data] : ({ ...data } as Record<string, unknown>);

    for (const key in sanitized as Record<string, unknown>) {
      if (this.sensitiveFields.includes(key)) {
        delete (sanitized as Record<string, unknown>)[key];
      } else {
        const val = (sanitized as Record<string, unknown>)[key];
        if (val && typeof val === 'object') {
          (sanitized as Record<string, unknown>)[key] = this.sanitize(val);
        }
      }
    }

    return sanitized;
  }
}
