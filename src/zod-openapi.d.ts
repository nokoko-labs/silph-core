/**
 * Type augmentation for nestjs-zod's patchNestJsSwagger().
 * At runtime, .openapi() is added to Zod types; this declaration satisfies TypeScript.
 */
import type { ZodTypeAny } from 'zod';

declare module 'zod' {
  interface ZodType<Output = unknown, Def = unknown, Input = Output> {
    openapi<T extends ZodTypeAny = this>(opts?: { example?: unknown }): T;
  }
}
