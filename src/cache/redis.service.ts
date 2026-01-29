import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private readonly configService: ConfigService) {
    // Prefer REDIS_URL if available, otherwise fall back to individual config
    const redisUrl = this.configService.get<string>('REDIS_URL');

    if (redisUrl) {
      // Use REDIS_URL if provided
      this.client = new Redis(redisUrl, {
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
      });
    } else {
      // Fallback to individual config (for backward compatibility)
      const host = this.configService.get<string>('REDIS_HOST', 'localhost');
      const port = this.configService.get<number>('REDIS_PORT', 6379);
      const password = this.configService.get<string>('REDIS_PASSWORD');

      this.client = new Redis({
        host,
        port,
        password,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
      });
    }

    this.setupEventHandlers();
  }

  onModuleInit() {
    this.logger.log('Redis service initialized');
  }

  private setupEventHandlers() {
    this.client.on('connect', () => {
      this.logger.log('Redis client connected');
    });

    this.client.on('ready', () => {
      this.logger.log('Redis client ready');
    });

    this.client.on('error', (error) => {
      this.logger.error(`Redis client error: ${error.message}`, error.stack);
    });

    this.client.on('close', () => {
      this.logger.warn('Redis client connection closed');
    });

    this.client.on('reconnecting', () => {
      this.logger.log('Redis client reconnecting...');
    });
  }

  /**
   * Get the Redis client instance
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Get a value from Redis
   */
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /**
   * Set a value in Redis
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<'OK'> {
    if (ttlSeconds) {
      return this.client.setex(key, ttlSeconds, value);
    }
    return this.client.set(key, value);
  }

  /**
   * Delete a key from Redis
   */
  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<number> {
    return this.client.exists(key);
  }

  /**
   * Set expiration time for a key
   */
  async expire(key: string, seconds: number): Promise<number> {
    return this.client.expire(key, seconds);
  }

  /**
   * Get time to live for a key
   */
  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  /**
   * Increment a key's value
   */
  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  /**
   * Decrement a key's value
   */
  async decr(key: string): Promise<number> {
    return this.client.decr(key);
  }

  /**
   * Get multiple keys
   */
  async mget(...keys: string[]): Promise<(string | null)[]> {
    return this.client.mget(...keys);
  }

  /**
   * Set multiple key-value pairs
   */
  async mset(...keyValues: string[]): Promise<'OK'> {
    return this.client.mset(...keyValues);
  }

  /**
   * Get all keys matching a pattern
   */
  async keys(pattern: string): Promise<string[]> {
    return this.client.keys(pattern);
  }

  /**
   * Flush all keys (use with caution)
   */
  async flushAll(): Promise<'OK'> {
    return this.client.flushall();
  }

  /**
   * Close the Redis connection
   */
  async disconnect(): Promise<void> {
    await this.client.quit();
    this.logger.log('Redis client disconnected');
  }
}
