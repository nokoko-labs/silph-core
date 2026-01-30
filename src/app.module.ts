import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { RedisModule } from '@/cache/redis.module';
import { ConfigModule } from '@/config/config.module';
import { DatabaseModule } from '@/database/database.module';
import { HealthModule } from '@/health/health.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { TenantsModule } from '@/modules/tenants/tenants.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const nodeEnv = configService.get<string>('NODE_ENV', 'dev');
        const isProd = nodeEnv === 'prod';

        return {
          pinoHttp: {
            level: 'info',
            ...(isProd
              ? {}
              : {
                  transport: {
                    target: 'pino-pretty',
                    options: { colorize: true },
                  },
                }),
          },
        };
      },
    }),
    DatabaseModule,
    HealthModule,
    RedisModule,
    AuthModule,
    TenantsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
