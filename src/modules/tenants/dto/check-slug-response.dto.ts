import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CheckSlugResponseSchema = z.object({
  available: z.boolean().describe('Whether the slug is available or already taken'),
});

export class CheckSlugResponseDto extends createZodDto(CheckSlugResponseSchema) {}
