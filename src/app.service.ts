import { Injectable } from '@nestjs/common';
import { HealthCheckDto } from './app.dto';

@Injectable()
export class AppService {
  getHealthCheck(): HealthCheckDto {
    return {
      status: 'OK',
      timestamp: new Date().toISOString(),
    };
  }
}
