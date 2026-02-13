import { ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '@/modules/auth/auth.service';
import { getCurrentUserFromContext } from './current-user.decorator';

const testPayload: JwtPayload = {
  sub: 'user-1',
  email: 'user@example.com',
  role: 'USER',
  tenantId: 'tenant-1',
};

function createMockContext(request: { user?: JwtPayload }): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: jest.fn(),
    getClass: jest.fn(),
  } as unknown as ExecutionContext;
}

describe('CurrentUser decorator', () => {
  it('should return full user when no key is passed', () => {
    const ctx = createMockContext({ user: testPayload });
    expect(getCurrentUserFromContext(undefined, ctx)).toEqual(testPayload);
  });

  it('should return user property when key is passed', () => {
    const ctx = createMockContext({ user: testPayload });
    expect(getCurrentUserFromContext('email', ctx)).toBe('user@example.com');
    expect(getCurrentUserFromContext('sub', ctx)).toBe('user-1');
    expect(getCurrentUserFromContext('role', ctx)).toBe('USER');
    expect(getCurrentUserFromContext('tenantId', ctx)).toBe('tenant-1');
  });

  it('should return undefined when user is missing and key is passed', () => {
    const ctx = createMockContext({});
    expect(getCurrentUserFromContext('email', ctx)).toBeUndefined();
  });
});
