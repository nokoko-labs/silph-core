import { Test, type TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let service: AuthService;

  const mockUser = {
    id: 'user-uuid-1',
    email: 'admin@example.com',
    password: 'hashed-password',
    role: 'ADMIN' as Role,
    tenantId: 'tenant-uuid-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockJwtPayload = {
    sub: mockUser.id,
    email: mockUser.email,
    role: mockUser.role,
    tenantId: mockUser.tenantId,
  };

  const mockAuthService = {
    login: jest.fn().mockReturnValue({ access_token: 'mock-jwt-token' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('should return access_token when user is attached by LocalAuthGuard', () => {
      const req = { user: mockUser };
      const loginDto = { email: 'admin@example.com', password: 'admin123' };

      const result = controller.login(req, loginDto);

      expect(result).toEqual({ access_token: 'mock-jwt-token' });
      expect(service.login).toHaveBeenCalledWith(mockUser);
    });
  });

  describe('getProfile', () => {
    it('should return current user payload from JWT', () => {
      const result = controller.getProfile(mockJwtPayload);

      expect(result).toEqual(mockJwtPayload);
    });
  });
});
