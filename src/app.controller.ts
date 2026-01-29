import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthCheckDto } from './app.dto';
import { AppService } from './app.service';

@ApiTags('api')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({
    status: 200,
    description: 'API is running',
    type: HealthCheckDto,
  })
  getHealthCheck(): HealthCheckDto {
    return this.appService.getHealthCheck();
  }
}
