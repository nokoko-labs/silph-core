import { faker } from '@faker-js/faker';
import { PrismaClient, Role, TenantStatus, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('--- 🚀 Starting Seed 80s Edition ---');

  const password = await bcrypt.hash('password123', 10);

  // --- 1. Mushroom Kingdom Tenant ---
  console.log('🍄 Creating Mushroom Kingdom...');
  const mushroomKingdom = await prisma.tenant.upsert({
    where: { slug: 'mushroom-kingdom' },
    update: {},
    create: {
      name: 'Mushroom Kingdom',
      slug: 'mushroom-kingdom',
      status: TenantStatus.ACTIVE,
      config: { color: 'red', icon: 'mushroom' },
    },
  });

  const mushroomUsers = [
    { email: 'mario@mushroom.com', role: Role.ADMIN, status: UserStatus.ACTIVE, name: 'Mario' },
    { email: 'luigi@mushroom.com', role: Role.USER, status: UserStatus.PENDING, name: 'Luigi' },
    {
      email: 'peach@mushroom.com',
      role: Role.USER,
      status: UserStatus.ACTIVE,
      name: 'Princess Peach',
    },
    { email: 'bowser@mushroom.com', role: Role.USER, status: UserStatus.SUSPENDED, name: 'Bowser' },
    {
      email: 'toad@mushroom.com',
      role: Role.USER,
      status: UserStatus.DELETED,
      name: 'Toad',
      deletedAt: faker.date.past({ years: 1 }),
    },
  ];

  for (const u of mushroomUsers) {
    await prisma.user.upsert({
      where: { email_tenantId: { email: u.email, tenantId: mushroomKingdom.id } },
      update: {},
      create: {
        email: u.email,
        password,
        role: u.role,
        status: u.status,
        tenantId: mushroomKingdom.id,
        deletedAt: u.deletedAt || null,
      },
    });
    console.log(`   👤 User created: ${u.name} (${u.email}) - ${u.status}`);
  }

  // --- 2. Castle Grayskull Tenant ---
  console.log('⚔️ Creating Castle Grayskull...');
  const grayskull = await prisma.tenant.upsert({
    where: { slug: 'castle-grayskull' },
    update: {},
    create: {
      name: 'Castle Grayskull',
      slug: 'castle-grayskull',
      status: TenantStatus.ACTIVE,
      config: { color: 'green', icon: 'skull' },
    },
  });

  const grayskullUsers = [
    { email: 'heman@eternia.com', role: Role.ADMIN, status: UserStatus.ACTIVE, name: 'He-Man' },
    { email: 'shera@eternia.com', role: Role.USER, status: UserStatus.ACTIVE, name: 'She-Ra' },
    {
      email: 'skeletor@eternia.com',
      role: Role.USER,
      status: UserStatus.SUSPENDED,
      name: 'Skeletor',
    },
    {
      email: 'manatarms@eternia.com',
      role: Role.USER,
      status: UserStatus.PENDING,
      name: 'Man-At-Arms',
    },
    {
      email: 'orko@eternia.com',
      role: Role.USER,
      status: UserStatus.DELETED,
      name: 'Orko',
      deletedAt: faker.date.past({ years: 2 }),
    },
  ];

  for (const u of grayskullUsers) {
    await prisma.user.upsert({
      where: { email_tenantId: { email: u.email, tenantId: grayskull.id } },
      update: {},
      create: {
        email: u.email,
        password,
        role: u.role,
        status: u.status,
        tenantId: grayskull.id,
        deletedAt: u.deletedAt || null,
      },
    });
    console.log(`   👤 User created: ${u.name} (${u.email}) - ${u.status}`);
  }

  // --- 3. Hill Valley (Soft Deleted) ---
  console.log('🚗 Creating Hill Valley (Soft Deleted)...');
  const hillValley = await prisma.tenant.upsert({
    where: { slug: 'hill-valley' },
    update: {
      deletedAt: new Date('1985-10-26T01:21:00Z'),
      status: TenantStatus.DELETED,
    },
    create: {
      name: 'Hill Valley',
      slug: 'hill-valley',
      status: TenantStatus.DELETED,
      deletedAt: new Date('1985-10-26T01:21:00Z'),
      config: { color: 'blue', icon: 'delorean' },
    },
  });

  const hillValleyUsers = [
    {
      email: 'marty@hillvalley.com',
      role: Role.ADMIN,
      status: UserStatus.SUSPENDED,
      name: 'Marty McFly',
    },
    {
      email: 'doc@hillvalley.com',
      role: Role.USER,
      status: UserStatus.SUSPENDED,
      name: 'Emmet Brown',
    },
    {
      email: 'biff@hillvalley.com',
      role: Role.USER,
      status: UserStatus.SUSPENDED,
      name: 'Biff Tannen',
    },
    {
      email: 'lorraine@hillvalley.com',
      role: Role.USER,
      status: UserStatus.DELETED,
      name: 'Lorraine Baines',
      deletedAt: faker.date.past(),
    },
    {
      email: 'george@hillvalley.com',
      role: Role.USER,
      status: UserStatus.DELETED,
      name: 'George McFly',
      deletedAt: faker.date.past(),
    },
  ];

  for (const u of hillValleyUsers) {
    await prisma.user.upsert({
      where: { email_tenantId: { email: u.email, tenantId: hillValley.id } },
      update: {},
      create: {
        email: u.email,
        password,
        role: u.role,
        status: u.status,
        tenantId: hillValley.id,
        deletedAt: u.deletedAt || null,
      },
    });
    console.log(`   👤 User created: ${u.name} (${u.email}) - ${u.status}`);
  }

  console.log('--- ✅ Seed Completed Successfully ---');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
