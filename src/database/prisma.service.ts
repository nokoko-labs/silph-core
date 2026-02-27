import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

/** Props that must be delegated to the base client so $on (logging) and lifecycle work. */
const BASE_CLIENT_PROPS = new Set(['$on', '$connect', '$disconnect', '$transaction']);

@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, 'query' | 'info' | 'warn' | 'error'>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  /** Extended client with tenant-scoping; model access is delegated here. */
  private readonly _extendedClient: ReturnType<PrismaClient['$extends']>;

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

    this.setupLogging();

    const isDev = this.configService.get<string>('NODE_ENV', 'dev') === 'dev';

    this._extendedClient = this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const start = Date.now();
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

            // 1) Bypass: if args.where.bypassTenantId === true, strip it from the where object BEFORE calling query.
            // Prisma would throw on unknown 'bypassTenantId'; and we must not inject CLS tenantId for this call.
            // Vital for GET /tenants and login (validateUserForTenants / getMembershipsForEmail) when token has no tenant yet.
            let bypassTenantId = false;
            if (operationsWithWhere.includes(operation)) {
              // biome-ignore lint/suspicious/noExplicitAny: dynamic args handling
              const dynamicArgs = args as any;
              dynamicArgs.where = dynamicArgs.where || {};
              if (dynamicArgs.where.bypassTenantId === true) {
                bypassTenantId = true;
                // Eliminar la propiedad antes de ejecutar la consulta para que Prisma no reciba un arg desconocido
                // biome-ignore lint/performance/noDelete: must remove key so Prisma does not receive unknown arg
                delete dynamicArgs.where.bypassTenantId;
              }
            }

            let result: unknown;
            if (bypassTenantId) {
              result = await query(args);
            } else {
              const tenantId = cls.get<string>('tenantId');
              const role = cls.get<string>('role');
              const modelsWithTenantId = ['User'];

              if (tenantId && role !== 'SUPER_ADMIN' && modelsWithTenantId.includes(model)) {
                // biome-ignore lint/suspicious/noExplicitAny: dynamic args handling
                const dynamicArgs = args as any;

                if (operationsWithWhere.includes(operation)) {
                  const isCrossTenantByEmail =
                    model === 'User' &&
                    dynamicArgs.where &&
                    'email' in dynamicArgs.where &&
                    dynamicArgs.where.tenantId === undefined;

                  if (dynamicArgs.where.tenantId === undefined && !isCrossTenantByEmail) {
                    dynamicArgs.where.tenantId = tenantId;
                  }

                  if (operation === 'findUnique') {
                    const context = Prisma.getExtensionContext(this);
                    // biome-ignore lint/suspicious/noExplicitAny: dynamic model delegation
                    const modelDelegate = (context as any)[
                      model.charAt(0).toLowerCase() + model.slice(1)
                    ];
                    if (modelDelegate?.findFirst) {
                      result = await modelDelegate.findFirst(args);
                      if (isDev) {
                        console.log(`[Prisma] ${model}.${operation} ${Date.now() - start}ms`);
                      }
                      return result;
                    }
                  }
                }

                if (operation === 'create') {
                  dynamicArgs.data = dynamicArgs.data || {};
                  if (dynamicArgs.data.tenantId === undefined) {
                    dynamicArgs.data.tenantId = tenantId;
                  }
                }

                if (operation === 'createMany') {
                  if (Array.isArray(dynamicArgs.data)) {
                    for (const item of dynamicArgs.data) {
                      if (item.tenantId === undefined) {
                        item.tenantId = tenantId;
                      }
                    }
                  } else if (dynamicArgs.data && dynamicArgs.data.tenantId === undefined) {
                    dynamicArgs.data.tenantId = tenantId;
                  }
                }
              }

              result = await query(args);
            }

            if (isDev) {
              console.log(`[Prisma] ${model}.${operation} ${Date.now() - start}ms`);
            }
            return result;
          },
        },
      },
    });

    // Proxy: base client for $on/$connect/$disconnect so logs work; extended client for models
    const extendedClient = this._extendedClient;
    // biome-ignore lint/correctness/noConstructorReturn: Required for Prisma Client Extensions with Proxy
    return new Proxy(this, {
      get: (target, prop) => {
        if (BASE_CLIENT_PROPS.has(prop as string)) {
          // biome-ignore lint/suspicious/noExplicitAny: proxy delegation to base
          return (target as any)[prop];
        }
        if (prop in extendedClient) {
          // biome-ignore lint/suspicious/noExplicitAny: proxy delegation to extended client
          return (extendedClient as any)[prop];
        }
        // biome-ignore lint/suspicious/noExplicitAny: proxy fallback
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

  /**
   * Base client event handlers. In dev, query events may not fire when using the extended client
   * via Proxy; use the per-operation log inside $extends as the primary source of query logs.
   * Temporary: using console.log for query to rule out NestJS logger level blocking output.
   */
  private setupLogging() {
    this.$on('query', (e: { query: string; params: string; duration: number }) => {
      const nodeEnv = this.configService.get<string>('NODE_ENV', 'dev');
      if (nodeEnv === 'dev') {
        console.log(`[Prisma $on] Query: ${e.query} | Params: ${e.params} | ${e.duration}ms`);
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
