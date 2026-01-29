import Joi from 'joi';

/**
 * Joi schema for validating environment variables at application startup.
 * The application will fail to start if required variables are missing or invalid.
 */
export const envSchema = Joi.object({
  DATABASE_URL: Joi.string().required().min(1),
  PORT: Joi.number().integer().positive().default(3000),
  NODE_ENV: Joi.string().valid('dev', 'prod', 'test').required(),
  REDIS_URL: Joi.string().required().min(1),
});
