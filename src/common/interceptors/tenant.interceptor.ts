import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Observable } from 'rxjs';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly cls: ClsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (user) {
      // Selection token may have no tenantId; set CLS only when present
      if (user.tenantId != null) {
        this.cls.set('tenantId', user.tenantId);
      }
      if (user.role != null) {
        this.cls.set('role', user.role);
      }
    }

    return next.handle();
  }
}
