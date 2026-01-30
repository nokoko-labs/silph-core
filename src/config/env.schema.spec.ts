import { describe, expect, it } from '@jest/globals';
import { envSchema } from './env.schema';

const validConfig = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  NODE_ENV: 'dev',
  JWT_SECRET: 'test-jwt-secret',
};

describe('envSchema', () => {
  it('should reject when DATABASE_URL is missing', () => {
    const config = {
      PORT: 3000,
      REDIS_URL: 'redis://localhost:6379',
      NODE_ENV: 'dev',
    };

    const { error } = envSchema.validate(config, { abortEarly: false });

    expect(error).toBeDefined();
    expect(error?.message).toContain('DATABASE_URL');
  });

  it('should reject when NODE_ENV is not dev, prod, or test', () => {
    const config = {
      ...validConfig,
      NODE_ENV: 'invalid',
    };

    const { error } = envSchema.validate(config, { abortEarly: false });

    expect(error).toBeDefined();
    expect(error?.message).toContain('NODE_ENV');
  });

  it('should reject when NODE_ENV is missing', () => {
    const config = {
      DATABASE_URL: 'postgresql://localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
      PORT: 3000,
    };

    const { error } = envSchema.validate(config, { abortEarly: false });

    expect(error).toBeDefined();
    expect(error?.message).toContain('NODE_ENV');
  });

  it('should reject when REDIS_URL is missing', () => {
    const config = {
      DATABASE_URL: 'postgresql://localhost:5432/test',
      PORT: 3000,
      NODE_ENV: 'dev',
    };

    const { error } = envSchema.validate(config, { abortEarly: false });

    expect(error).toBeDefined();
    expect(error?.message).toContain('REDIS_URL');
  });

  it('should reject when DATABASE_URL is empty', () => {
    const config = {
      ...validConfig,
      DATABASE_URL: '',
    };

    const { error } = envSchema.validate(config, { abortEarly: false });

    expect(error).toBeDefined();
    expect(error?.message).toContain('DATABASE_URL');
  });

  it('should reject when PORT is not a positive number', () => {
    const config = {
      ...validConfig,
      PORT: -1,
    };

    const { error } = envSchema.validate(config, { abortEarly: false });

    expect(error).toBeDefined();
    expect(error?.message).toContain('PORT');
  });

  it('should validate successfully with all required variables', () => {
    const config = {
      PORT: 3000,
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
      NODE_ENV: 'dev',
      JWT_SECRET: 'test-jwt-secret',
    };

    const { value, error } = envSchema.validate(config, { abortEarly: false });

    expect(error).toBeUndefined();
    expect(value.PORT).toBe(3000);
    expect(value.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/test');
    expect(value.REDIS_URL).toBe('redis://localhost:6379');
    expect(value.NODE_ENV).toBe('dev');
  });

  it('should default PORT to 3000 when omitted', () => {
    const config = {
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
      NODE_ENV: 'dev',
      JWT_SECRET: 'test-jwt-secret',
    };

    const { value, error } = envSchema.validate(config, { abortEarly: false });

    expect(error).toBeUndefined();
    expect(value.PORT).toBe(3000);
  });

  it('should accept NODE_ENV prod', () => {
    const config = {
      ...validConfig,
      NODE_ENV: 'prod',
    };

    const { value, error } = envSchema.validate(config, { abortEarly: false });

    expect(error).toBeUndefined();
    expect(value.NODE_ENV).toBe('prod');
  });

  it('should accept NODE_ENV test', () => {
    const config = {
      ...validConfig,
      NODE_ENV: 'test',
    };

    const { value, error } = envSchema.validate(config, { abortEarly: false });

    expect(error).toBeUndefined();
    expect(value.NODE_ENV).toBe('test');
  });

  it('should coerce string PORT to number', () => {
    const config = {
      ...validConfig,
      PORT: '4000',
    };

    const { value, error } = envSchema.validate(config, { abortEarly: false });

    expect(error).toBeUndefined();
    expect(value.PORT).toBe(4000);
  });
});
