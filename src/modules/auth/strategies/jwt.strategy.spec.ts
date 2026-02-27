import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { JwtPayload } from '../auth.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue('test-jwt-secret'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [JwtStrategy, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  it('should call ConfigService.getOrThrow for JWT_SECRET', () => {
    expect(mockConfigService.getOrThrow).toHaveBeenCalledWith('JWT_SECRET');
  });

  describe('validate', () => {
    it('should return full payload when all required fields are present', () => {
      const payload: JwtPayload = {
        sub: 'user-1',
        email: 'user@example.com',
        role: 'USER',
        tenantId: 'tenant-1',
        status: 'ACTIVE',
      };
      expect(strategy.validate(payload)).toEqual(payload);
    });

    it('should return selection payload (sub + email only) for tenant selection token', () => {
      const payload = { sub: 'user-1', email: 'user@example.com' };
      expect(strategy.validate(payload)).toEqual(payload);
    });

    it('should throw UnauthorizedException when sub is missing', () => {
      const payload = {
        email: 'user@example.com',
        role: 'USER',
        tenantId: 'tenant-1',
      } as unknown as JwtPayload;
      expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
      expect(() => strategy.validate(payload)).toThrow('Invalid token payload');
    });

    it('should throw UnauthorizedException when email is missing', () => {
      const payload = {
        sub: 'user-1',
        role: 'USER',
        tenantId: 'tenant-1',
      } as unknown as JwtPayload;
      expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
    });

    it('should throw when full token has tenantId but missing role', () => {
      const payload = {
        sub: 'user-1',
        email: 'user@example.com',
        tenantId: 'tenant-1',
      } as unknown as JwtPayload;
      expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
    });

    it('should throw when full token has tenantId but missing status', () => {
      const payload = {
        sub: 'user-1',
        email: 'user@example.com',
        role: 'USER',
        tenantId: 'tenant-1',
      } as unknown as JwtPayload;
      expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
    });
  });
});
