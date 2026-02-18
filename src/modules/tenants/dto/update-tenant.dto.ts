import { PartialType } from '@nestjs/swagger';
import { CreateTenantDto } from './create-tenant.dto';

/**
 * Schema for updating an existing tenant.
 * Uses a partial version of the CreateTenantDto.
 */
export class UpdateTenantDto extends PartialType(CreateTenantDto) {}
