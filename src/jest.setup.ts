/**
 * Runs before each test file so Zod schemas have .openapi() when using nestjs-zod.
 * patchNestJsSwagger() extends Zod's prototype; without it, DTOs that call .openapi() throw in Jest.
 */
import { patchNestJsSwagger } from 'nestjs-zod';

patchNestJsSwagger();
