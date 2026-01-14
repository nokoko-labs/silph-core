import { z } from 'zod';

export const configValidationSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
});

export type ConfigValidationSchema = z.infer<typeof configValidationSchema>;

// Adapter function to convert Zod schema to a validation function for @nestjs/config
export function validateConfig(config: Record<string, unknown>) {
  const result = configValidationSchema.safeParse(config);
  if (!result.success) {
    throw new Error(
      `Configuration validation failed: ${result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
    );
  }
  return result.data;
}
