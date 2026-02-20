import type { ZodTypeAny } from 'zod';

/**
 * Applies .openapi({ example }) to a Zod schema only when patchNestJsSwagger() has run.
 * Use in DTO schemas so they can load before main.ts applies the patch (e.g. webpack).
 */
export function withOpenApiExample<T extends ZodTypeAny>(schema: T, example: unknown): T {
  const s = schema as T & { openapi?: (opts: { example: unknown }) => T };
  if (typeof s.openapi === 'function') {
    return s.openapi({ example }) as T;
  }
  return schema;
}
