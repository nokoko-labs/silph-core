import { NotFoundException } from '@nestjs/common';
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
    createdAt: new Date(),
    updatedAt: new Date(),
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
    it('should create a user and return it', async () => {
      const dto = { email: 'test@example.com', password: 'password', tenantId: 'tenant-id' };
      const result = await controller.create(dto);

      expect(result).toEqual(mockUser);
      expect(service.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('findAll', () => {
    it('should return an array of users', async () => {
      const result = await controller.findAll();

      expect(result).toEqual([mockUser]);
      expect(service.findAll).toHaveBeenCalledWith(undefined);
    });

    it('should filter by tenantId if provided', async () => {
      await controller.findAll('tenant-1');
      expect(service.findAll).toHaveBeenCalledWith('tenant-1');
    });
  });

  describe('findOne', () => {
    it('should return a user by id', async () => {
      const result = await controller.findOne('user-id');

      expect(result).toEqual(mockUser);
      expect(service.findOne).toHaveBeenCalledWith('user-id');
    });

    it('should propagate NotFoundException', async () => {
      (service.findOne as jest.Mock).mockRejectedValue(new NotFoundException());

      await expect(controller.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a user', async () => {
      const dto = { email: 'new@example.com' };
      const result = await controller.update('user-id', dto);

      expect(result).toEqual(mockUser);
      expect(service.update).toHaveBeenCalledWith('user-id', dto);
    });
  });

  describe('remove', () => {
    it('should delete a user', async () => {
      const result = await controller.remove('user-id');

      expect(result).toEqual(mockUser);
      expect(service.remove).toHaveBeenCalledWith('user-id');
    });
  });
});
