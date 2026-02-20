import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { type DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaService } from '@/database/prisma.service';
import { UsersService } from './users.service';

jest.mock('bcryptjs');

function createPrismaP2002Error(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.x',
  });
}

function createPrismaP2025Error(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Record not found', {
    code: 'P2025',
    clientVersion: '5.x',
  });
}

describe('UsersService', () => {
  let service: UsersService;
  let prisma: DeepMockProxy<PrismaService>;

  const mockUser = {
    id: 'user-id',
    email: 'test@example.com',
    password: 'hashed-password',
    role: Role.USER,
    status: 'ACTIVE',
    tenantId: 'tenant-id',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const mockPrisma = mockDeep<PrismaService>();

  beforeEach(async () => {
    jest.clearAllMocks();
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a user', async () => {
      const dto = { email: 'test@example.com', password: 'password', tenantId: 'tenant-id' };
      mockPrisma.user.create.mockResolvedValue(mockUser);

      const result = await service.create(dto);

      expect(result).toEqual(mockUser);
      expect(bcrypt.hash).toHaveBeenCalledWith('password', 10);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: dto.email,
          password: 'hashed-password',
          tenantId: dto.tenantId,
          role: 'USER',
        },
      });
    });

    it('should throw ConflictException when email-tenant combo already exists', async () => {
      const dto = { email: 'test@example.com', password: 'password', tenantId: 'tenant-id' };
      mockPrisma.user.create.mockRejectedValue(createPrismaP2002Error());

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    const defaultQuery = {
      page: 1,
      limit: 10,
      sortBy: 'createdAt' as const,
      sortOrder: 'desc' as const,
    };

    it('should filter by tenantId and exclude deleted users', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await service.findAll('tenant-id', defaultQuery);

      expect(result).toEqual({ data: [mockUser], meta: { total: 1, page: 1, lastPage: 1 } });
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-id', deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      });
      expect(prisma.user.count).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-id', deletedAt: null },
      });
    });

    it('should apply role and status filters when provided', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await service.findAll('tenant-id', {
        ...defaultQuery,
        role: Role.ADMIN,
        status: 'ACTIVE',
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: 'tenant-id',
            deletedAt: null,
            role: Role.ADMIN,
            status: 'ACTIVE',
          },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a user by id', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findOne('user-id');

      expect(result).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-id', deletedAt: null },
      });
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should return a user by id and tenantId', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);

      const result = await service.findOne('user-id', 'tenant-id');

      expect(result).toEqual(mockUser);
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: 'user-id', tenantId: 'tenant-id', deletedAt: null },
      });
    });

    it('should throw NotFoundException when user not found in tenant', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.findOne('id', 'tenant')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('id', 'tenant')).rejects.toThrow(
        'User with id "id" not found in this tenant',
      );
    });
  });

  describe('update', () => {
    it('should update a user', async () => {
      const dto = { email: 'new@example.com' };
      mockPrisma.user.update.mockResolvedValue({ ...mockUser, email: dto.email });

      const result = await service.update('user-id', dto);

      expect(result.email).toBe(dto.email);
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('should hash password if provided', async () => {
      const dto = { password: 'new-password' };
      mockPrisma.user.update.mockResolvedValue(mockUser);

      await service.update('user-id', dto);

      expect(bcrypt.hash).toHaveBeenCalledWith('new-password', 10);
    });

    it('should throw ConflictException when email-tenant combo already exists on update', async () => {
      const dto = { email: 'duplicate@example.com' };
      mockPrisma.user.update.mockRejectedValue(createPrismaP2002Error());

      await expect(service.update('user-id', dto)).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException when record to update is not found', async () => {
      const dto = { email: 'new@example.com' };
      mockPrisma.user.update.mockRejectedValue(createPrismaP2025Error());

      await expect(service.update('user-id', dto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should soft delete a user', async () => {
      // Mock findOne to return a non-ADMIN or a tenant with multiple admins
      mockPrisma.user.findUnique.mockResolvedValue(mockUser); // Role.USER
      mockPrisma.user.update.mockResolvedValue({
        ...mockUser,
        status: 'DELETED',
        deletedAt: new Date(),
      });

      const result = await service.remove('user-id');

      expect(result.status).toBe('DELETED');
      expect(result.deletedAt).toBeDefined();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        data: {
          status: 'DELETED',
          deletedAt: expect.any(Date),
        },
      });
    });

    it('should throw ConflictException if deleting the last ADMIN', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, role: Role.ADMIN });
      mockPrisma.user.count.mockResolvedValue(1);

      await expect(service.remove('user-id')).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException when user does not exist or is already deleted', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.remove('user-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when prisma update fails in remove', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockRejectedValue(createPrismaP2025Error());

      await expect(service.remove('user-id')).rejects.toThrow(NotFoundException);
    });
  });
});
