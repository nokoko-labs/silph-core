import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, 'query' | 'info' | 'warn' | 'error'>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(
    private readonly configService: ConfigService,
    cls: ClsService,
  ) {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
      ],
    });

    // biome-ignore lint/suspicious/noExplicitAny: extension return type is complex
    const client: any = this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const tenantId = cls.get<string>('tenantId');
            const role = cls.get<string>('role');

            // List of models that have a tenantId field
            const modelsWithTenantId = ['User'];

            if (tenantId && role !== 'SUPER_ADMIN' && modelsWithTenantId.includes(model)) {
              // biome-ignore lint/suspicious/noExplicitAny: dynamic args handling
              const dynamicArgs = args as any;
              // Intercept all read and write operations that use a 'where' clause
              const operationsWithWhere = [
                'findMany',
                'findFirst',
                'findUnique',
                'update',
                'updateMany',
                'delete',
                'deleteMany',
                'count',
                'aggregate',
                'groupBy',
                'upsert',
              ];

              if (operationsWithWhere.includes(operation)) {
                dynamicArgs.where = dynamicArgs.where || {};
                dynamicArgs.where.tenantId = tenantId;

                // For findUnique, we must convert it to findFirst because adding tenantId
                // might break the unique constraint requirement in the where clause
                // if they are not part of a compound unique index.
                if (operation === 'findUnique') {
                  // biome-ignore lint/suspicious/noExplicitAny: dynamic model access
                  return (this as any)[model].findFirst(args);
                }
              }

              // For create, ensure tenantId is set
              if (operation === 'create') {
                dynamicArgs.data = dynamicArgs.data || {};
                dynamicArgs.data.tenantId = tenantId;
              }

              // For createMany, ensure tenantId is set for all records
              if (operation === 'createMany') {
                if (Array.isArray(dynamicArgs.data)) {
                  for (const item of dynamicArgs.data) {
                    item.tenantId = tenantId;
                  }
                } else if (dynamicArgs.data) {
                  dynamicArgs.data.tenantId = tenantId;
                }
              }
            }

            return query(args);
          },
        },
      },
    });

    this.setupLogging();

    // Use a Proxy to delegate all calls to the extended client
    // This allows the service to still be used as a PrismaClient
    // biome-ignore lint/correctness/noConstructorReturn: Required for Prisma Client Extensions with Proxy
    return new Proxy(this, {
      get: (target, prop) => {
        if (prop in client) {
          return client[prop];
        }
        // biome-ignore lint/suspicious/noExplicitAny: proxy delegation
        return (target as any)[prop];
      },
    });
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
