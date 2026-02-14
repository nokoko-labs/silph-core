import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service';

// Mock ioredis
jest.mock('ioredis', () => {
  return {
    Redis: jest.fn().mockImplementation(() => {
      return {
        on: jest.fn(),
        get: jest.fn(),
        set: jest.fn(),
        setex: jest.fn(),
        del: jest.fn(),
        exists: jest.fn(),
        expire: jest.fn(),
        ttl: jest.fn(),
        incr: jest.fn(),
        decr: jest.fn(),
        mget: jest.fn(),
        mset: jest.fn(),
        keys: jest.fn(),
        flushall: jest.fn(),
        quit: jest.fn(),
      };
    }),
  };
});

describe('RedisService', () => {
  let service: RedisService;
  // biome-ignore lint/suspicious/noExplicitAny: mockRedis needs to be any to access mock methods
  let mockRedis: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: {
            // biome-ignore lint/suspicious/noExplicitAny: defaultValue can be any
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'REDIS_URL') return 'redis://localhost:6379';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
    // biome-ignore lint/suspicious/noExplicitAny: accessing private client for testing
    mockRedis = (service as any).client;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('get', () => {
    it('should call client.get', async () => {
      mockRedis.get.mockResolvedValue('value');
      const result = await service.get('key');
      expect(mockRedis.get).toHaveBeenCalledWith('key');
      expect(result).toBe('value');
    });
  });

  describe('set', () => {
    it('should call client.set without ttl', async () => {
      mockRedis.set.mockResolvedValue('OK');
      const result = await service.set('key', 'value');
      expect(mockRedis.set).toHaveBeenCalledWith('key', 'value');
      expect(result).toBe('OK');
    });

    it('should call client.setex with ttl', async () => {
      mockRedis.setex.mockResolvedValue('OK');
      const result = await service.set('key', 'value', 60);
      expect(mockRedis.setex).toHaveBeenCalledWith('key', 60, 'value');
      expect(result).toBe('OK');
    });
  });

  describe('del', () => {
    it('should call client.del', async () => {
      mockRedis.del.mockResolvedValue(1);
      const result = await service.del('key');
      expect(mockRedis.del).toHaveBeenCalledWith('key');
      expect(result).toBe(1);
    });
  });

  describe('exists', () => {
    it('should call client.exists', async () => {
      mockRedis.exists.mockResolvedValue(1);
      const result = await service.exists('key');
      expect(mockRedis.exists).toHaveBeenCalledWith('key');
      expect(result).toBe(1);
    });
  });

  describe('expire', () => {
    it('should call client.expire', async () => {
      mockRedis.expire.mockResolvedValue(1);
      const result = await service.expire('key', 60);
      expect(mockRedis.expire).toHaveBeenCalledWith('key', 60);
      expect(result).toBe(1);
    });
  });

  describe('ttl', () => {
    it('should call client.ttl', async () => {
      mockRedis.ttl.mockResolvedValue(60);
      const result = await service.ttl('key');
      expect(mockRedis.ttl).toHaveBeenCalledWith('key');
      expect(result).toBe(60);
    });
  });

  describe('incr', () => {
    it('should call client.incr', async () => {
      mockRedis.incr.mockResolvedValue(1);
      const result = await service.incr('key');
      expect(mockRedis.incr).toHaveBeenCalledWith('key');
      expect(result).toBe(1);
    });
  });

  describe('mget', () => {
    it('should call client.mget', async () => {
      mockRedis.mget.mockResolvedValue(['v1', 'v2']);
      const result = await service.mget('k1', 'k2');
      expect(mockRedis.mget).toHaveBeenCalledWith('k1', 'k2');
      expect(result).toEqual(['v1', 'v2']);
    });
  });

  describe('mset', () => {
    it('should call client.mset', async () => {
      mockRedis.mset.mockResolvedValue('OK');
      const result = await service.mset('k1', 'v1', 'k2', 'v2');
      expect(mockRedis.mset).toHaveBeenCalledWith('k1', 'v1', 'k2', 'v2');
      expect(result).toBe('OK');
    });
  });

  describe('flushAll', () => {
    it('should call client.flushall', async () => {
      mockRedis.flushall.mockResolvedValue('OK');
      const result = await service.flushAll();
      expect(mockRedis.flushall).toHaveBeenCalled();
      expect(result).toBe('OK');
    });
  });

  describe('disconnect', () => {
    it('should call client.quit', async () => {
      mockRedis.quit.mockResolvedValue('OK');
      await service.disconnect();
      expect(mockRedis.quit).toHaveBeenCalled();
    });
  });
});
