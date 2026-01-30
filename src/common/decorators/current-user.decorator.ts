import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '@/modules/auth/auth.service'; // type-only to avoid circular dependency

/**
 * Extracts the JWT user payload from the request (set by JwtStrategy).
 */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext): JwtPayload | unknown => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    const user = request.user;
    if (data) {
      return user?.[data];
    }
    return user;
  },
);
