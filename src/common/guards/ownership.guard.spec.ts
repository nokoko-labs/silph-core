import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { OwnershipGuard } from './ownership.guard';

describe('OwnershipGuard', () => {
  let guard: OwnershipGuard;

  beforeEach(() => {
    guard = new OwnershipGuard();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should return false if no user is present in request', () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: null,
        }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(false);
  });

  it('should return true if user is SUPER_ADMIN', () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { role: Role.SUPER_ADMIN },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should return true if no tenantId is found in request params or body', () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { role: Role.USER, tenantId: 'tenant-1' },
          params: {},
          body: {},
        }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should return true if user tenantId matches tenantId from request params "id"', () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { role: Role.USER, tenantId: 'tenant-1' },
          params: { id: 'tenant-1' },
          body: {},
        }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should return true if user tenantId matches tenantId from request params "tenantId"', () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { role: Role.USER, tenantId: 'tenant-1' },
          params: { tenantId: 'tenant-1' },
          body: {},
        }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should return true if user tenantId matches tenantId from request body', () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { role: Role.USER, tenantId: 'tenant-1' },
          params: {},
          body: { tenantId: 'tenant-1' },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException if user tenantId does not match request tenantId', () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { role: Role.USER, tenantId: 'tenant-1' },
          params: { id: 'tenant-2' },
          body: {},
        }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow(
      'You do not have access to this tenant resource',
    );
  });
});
