import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, 'query' | 'info' | 'warn' | 'error'>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly configService: ConfigService) {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
      ],
    });

    this.setupLogging();
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connection established');
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }

  private setupLogging() {
    this.$on('query', (e: { query: string; params: string; duration: number }) => {
      const nodeEnv = this.configService.get<string>('NODE_ENV', 'dev');
      if (nodeEnv === 'dev') {
        this.logger.debug(`Query: ${e.query}`);
        this.logger.debug(`Params: ${e.params}`);
        this.logger.debug(`Duration: ${e.duration}ms`);
      }
    });

    this.$on('error', (e: { message: string; target: string }) => {
      this.logger.error(`Database error: ${e.message}`, e.target);
    });

    this.$on('info', (e: { message: string; target: string }) => {
      this.logger.log(`Database info: ${e.message}`);
    });

    this.$on('warn', (e: { message: string; target: string }) => {
      this.logger.warn(`Database warning: ${e.message}`);
    });
  }
}
