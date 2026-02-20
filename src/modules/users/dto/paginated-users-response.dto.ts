import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PaginationMetaSchema } from '@/common/dto/pagination.dto';
import { UserResponseSchema } from './user-response.dto';

export const PaginatedUsersResponseSchema = z.object({
  data: z.array(UserResponseSchema).describe('List of users'),
  meta: PaginationMetaSchema.describe('Pagination metadata'),
});

export type PaginatedUsersResponse = z.infer<typeof PaginatedUsersResponseSchema>;

export class PaginatedUsersResponseDto extends createZodDto(PaginatedUsersResponseSchema) {}
