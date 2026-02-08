import { ApiProperty } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const oauthExchangeSchema = z.object({
  code: z.string().min(1, 'Code is required'),
});

export class OauthExchangeDto extends createZodDto(oauthExchangeSchema) {
  @ApiProperty({
    description: 'OAuth authorization code from Google callback redirect',
    example: '4/0Aean...',
    required: true,
  })
  code!: string;
}
