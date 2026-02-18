import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ClsModule } from 'nestjs-cls';
import { LoggerModule } from 'nestjs-pino';
import { RedisModule } from '@/cache/redis.module';
import { ConfigModule } from '@/config/config.module';
import { DatabaseModule } from '@/database/database.module';
import { HealthModule } from '@/health/health.module';
import { AuditInterceptor } from '@/modules/audit/audit.interceptor';
import { AuditModule } from '@/modules/audit/audit.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { MailModule } from '@/modules/mail/mail.module';
import { PaymentsModule } from '@/modules/payments/payments.module';
import { TenantsModule } from '@/modules/tenants/tenants.module';
import { UsersModule } from '@/modules/users/users.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TenantInterceptor } from './common/interceptors/tenant.interceptor';

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
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    HealthModule,
    RedisModule,
    AuthModule,
    PaymentsModule,
    TenantsModule,
    UsersModule,
    MailModule,
    AuditModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
