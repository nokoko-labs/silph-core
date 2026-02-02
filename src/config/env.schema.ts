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
  JWT_SECRET: Joi.string().required().min(1),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  // Google OAuth (social login)
  GOOGLE_CLIENT_ID: Joi.string().optional().allow(''),
  GOOGLE_CLIENT_SECRET: Joi.string().optional().allow(''),
  GOOGLE_CALLBACK_URL: Joi.string().uri().optional().allow(''),
  OAUTH_DEFAULT_TENANT_ID: Joi.string().uuid().optional().allow(''),
  OAUTH_SUCCESS_REDIRECT_URL: Joi.string().uri().optional().allow(''),
  ALLOWED_OAUTH_REDIRECT_DOMAINS: Joi.string().default(''),
  OAUTH_CODE_EXPIRES_IN: Joi.number().integer().positive().default(60),
});
