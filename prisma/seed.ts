import { type Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { z } from 'zod';

/**
 * Zod schemas for seed data validation.
 * Aligned with prisma/schema.prisma (Tenant and User models).
 */

const TenantSeedSchema = z.object({
  name: z.string().min(1, 'Tenant name is required'),
  slug: z.string().min(1, 'Tenant slug is required'),
  isActive: z.boolean().default(true),
  config: z.record(z.unknown()).optional().nullable(),
});

const UserSeedSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
  role: z.enum(['ADMIN', 'USER']).default('ADMIN'),
  tenantId: z.string().uuid(),
});

type TenantSeed = z.infer<typeof TenantSeedSchema>;
type UserSeed = z.infer<typeof UserSeedSchema>;

const INITIAL_TENANT_SLUG = 'default';
const ADMIN_USER_EMAIL = 'admin@example.com';

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  const tenantPayload: TenantSeed = {
    name: 'Default Tenant',
    slug: INITIAL_TENANT_SLUG,
    isActive: true,
  };

  const tenantParsed = TenantSeedSchema.safeParse(tenantPayload);
  if (!tenantParsed.success) {
    console.error('Tenant seed validation failed:', tenantParsed.error.flatten());
    throw new Error('Invalid tenant seed data');
  }

  console.log('Creating Tenant...');
  const configJson: Prisma.InputJsonValue | undefined =
    tenantParsed.data.config != null
      ? (tenantParsed.data.config as Prisma.InputJsonValue)
      : undefined;

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantParsed.data.slug },
    create: {
      name: tenantParsed.data.name,
      slug: tenantParsed.data.slug,
      isActive: tenantParsed.data.isActive,
      config: configJson,
    },
    update: {
      name: tenantParsed.data.name,
      isActive: tenantParsed.data.isActive,
      config: configJson,
    },
  });
  console.log('Tenant created/updated:', tenant.id, tenant.slug);

  const adminPassword =
    process.env.NODE_ENV === 'production'
      ? (() => {
          const p = process.env.ADMIN_SEED_PASSWORD;
          if (p == null || p === '') {
            throw new Error('ADMIN_SEED_PASSWORD is required in production');
          }
          return p;
        })()
      : (process.env.ADMIN_SEED_PASSWORD ?? 'admin123');

  const userPayload: UserSeed = {
    email: ADMIN_USER_EMAIL,
    password: adminPassword,
    role: 'ADMIN',
    tenantId: tenant.id,
  };

  const userParsed = UserSeedSchema.safeParse(userPayload);
  if (!userParsed.success) {
    console.error('User seed validation failed:', userParsed.error.flatten());
    throw new Error('Invalid user seed data');
  }

  const hashedPassword = bcrypt.hashSync(userParsed.data.password, 10);
  console.log('Creating User (admin)...');
  const user = await prisma.user.upsert({
    where: { email: userParsed.data.email },
    create: {
      email: userParsed.data.email,
      password: hashedPassword,
      role: userParsed.data.role,
      tenantId: userParsed.data.tenantId,
    },
    update: {
      password: hashedPassword,
      role: userParsed.data.role,
      tenantId: userParsed.data.tenantId,
    },
  });
  console.log('User created/updated:', user.id, user.email);

  await prisma.$disconnect();
  console.log('Seed completed successfully.');
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
