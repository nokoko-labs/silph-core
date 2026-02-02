import { UnauthorizedException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { AuthService } from '../auth.service';
import { LocalStrategy } from './local.strategy';

describe('LocalStrategy', () => {
  let strategy: LocalStrategy;
  let authService: AuthService;

  const mockUser = {
    id: 'user-1',
    email: 'user@example.com',
    password: 'hashed',
    role: 'USER' as Role,
    tenantId: 'tenant-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAuthService = {
    validateUser: jest.fn().mockResolvedValue(mockUser),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    (mockAuthService.validateUser as jest.Mock).mockResolvedValue(mockUser);

    const module: TestingModule = await Test.createTestingModule({
      providers: [LocalStrategy, { provide: AuthService, useValue: mockAuthService }],
    }).compile();

    strategy = module.get<LocalStrategy>(LocalStrategy);
    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    it('should return user when email and password are valid', async () => {
      const result = await strategy.validate('user@example.com', 'password123');
      expect(result).toEqual(mockUser);
      expect(authService.validateUser).toHaveBeenCalledWith('user@example.com', 'password123');
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      (mockAuthService.validateUser as jest.Mock).mockResolvedValue(null);

      await expect(strategy.validate('unknown@example.com', 'pass')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate('unknown@example.com', 'pass')).rejects.toThrow(
        'Invalid email or password',
      );
    });

    it('should throw UnauthorizedException when password is wrong', async () => {
      (mockAuthService.validateUser as jest.Mock).mockResolvedValue(null);

      await expect(strategy.validate('user@example.com', 'wrong-password')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
