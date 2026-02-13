import { Test, type TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  const mockUser = {
    id: 'user-id',
    email: 'test@example.com',
    role: Role.USER,
    tenantId: 'tenant-id',
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAdminPayload: JwtPayload = {
    sub: 'admin-id',
    email: 'admin@example.com',
    role: Role.ADMIN,
    tenantId: 'tenant-id',
    status: 'ACTIVE',
  };

  const mockUserPayload: JwtPayload = {
    sub: 'user-id',
    email: 'test@example.com',
    role: Role.USER,
    tenantId: 'tenant-id',
    status: 'ACTIVE',
  };

  const mockUsersService = {
    create: jest.fn().mockResolvedValue(mockUser),
    findAll: jest.fn().mockResolvedValue([mockUser]),
    findOne: jest.fn().mockResolvedValue(mockUser),
    update: jest.fn().mockResolvedValue(mockUser),
    remove: jest.fn().mockResolvedValue(mockUser),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a user and return it (as active admin)', async () => {
      const dto: CreateUserDto = { email: 'test@example.com', password: 'password' };
      const result = await controller.create(dto, mockAdminPayload);

      expect(result).toEqual(mockUser);
      expect(service.create).toHaveBeenCalledWith({ ...dto, tenantId: 'tenant-id' });
    });

    it('should throw ForbiddenException if admin is not active', async () => {
      const dto: CreateUserDto = { email: 'test@example.com', password: 'password' };
      const inactiveAdmin = { ...mockAdminPayload, status: 'PENDING' };

      await expect(controller.create(dto, inactiveAdmin)).rejects.toThrow();
    });
  });

  describe('findAll', () => {
    it('should return an array of users for the same tenant (as active admin)', async () => {
      const result = await controller.findAll(mockAdminPayload);

      expect(result).toEqual([mockUser]);
      expect(service.findAll).toHaveBeenCalledWith('tenant-id');
    });

    it('should throw ForbiddenException if admin is not active', async () => {
      const inactiveAdmin = { ...mockAdminPayload, status: 'SUSPENDED' };
      await expect(controller.findAll(inactiveAdmin)).rejects.toThrow();
    });
  });

  describe('findOne', () => {
    it('should return a user by id if requester is active admin of same tenant', async () => {
      const result = await controller.findOne('user-id', mockAdminPayload);

      expect(result).toEqual(mockUser);
      expect(service.findOne).toHaveBeenCalledWith('user-id');
    });

    it('should throw ForbiddenException if requester is a regular user', async () => {
      await expect(controller.findOne('user-id', mockUserPayload)).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('should update a user if requester is self', async () => {
      const dto: UpdateUserDto = { email: 'new@example.com' };
      const result = await controller.update('user-id', dto, mockUserPayload);

      expect(result).toEqual(mockUser);
      expect(service.update).toHaveBeenCalledWith('user-id', dto);
    });

    it('should update a user if requester is admin of same tenant', async () => {
      const dto: UpdateUserDto = { email: 'new@example.com' };
      const result = await controller.update('user-id', dto, mockAdminPayload);

      expect(result).toEqual(mockUser);
    });
  });

  describe('remove', () => {
    it('should delete a user if requester is self', async () => {
      const result = await controller.remove('user-id', mockUserPayload);

      expect(result).toEqual(mockUser);
      expect(service.remove).toHaveBeenCalledWith('user-id');
    });

    it('should delete a user if requester is admin of same tenant', async () => {
      const result = await controller.remove('user-id', mockAdminPayload);

      expect(result).toEqual(mockUser);
    });
  });
});
