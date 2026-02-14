import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { of } from 'rxjs';
import { TenantInterceptor } from './tenant.interceptor';

describe('TenantInterceptor', () => {
  let interceptor: TenantInterceptor;
  let cls: ClsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantInterceptor,
        {
          provide: ClsService,
          useValue: {
            set: jest.fn(),
          },
        },
      ],
    }).compile();

    interceptor = module.get<TenantInterceptor>(TenantInterceptor);
    cls = module.get<ClsService>(ClsService);
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should set tenantId and role in CLS if user is present', () => {
    const user = { tenantId: 'tenant-1', role: 'USER' };
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;

    const next: CallHandler = {
      handle: () => of('next'),
    };

    interceptor.intercept(context, next);

    expect(cls.set).toHaveBeenCalledWith('tenantId', 'tenant-1');
    expect(cls.set).toHaveBeenCalledWith('role', 'USER');
  });

  it('should not set CLS if user is not present', () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user: null }),
      }),
    } as unknown as ExecutionContext;

    const next: CallHandler = {
      handle: () => of('next'),
    };

    interceptor.intercept(context, next);

    expect(cls.set).not.toHaveBeenCalled();
  });

  it('should call next.handle()', (done) => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user: null }),
      }),
    } as unknown as ExecutionContext;

    const next: CallHandler = {
      handle: () => of('next'),
    };

    interceptor.intercept(context, next).subscribe((result) => {
      expect(result).toBe('next');
      done();
    });
  });
});
