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
      config: { public: { theme: { color: 'red', icon: 'mushroom' } }, private: {} },
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
      config: { public: { theme: { color: 'green', icon: 'skull' } }, private: {} },
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

  // --- 4. Nokoko Labs (New Main Tenant) ---
  console.log('🧪 Creating Nokoko Labs...');
  const nokokoLabs = await prisma.tenant.upsert({
    where: { slug: 'nokoko-labs' },
    update: {},
    create: {
      name: 'Nokoko Labs',
      slug: 'nokoko-labs',
      status: TenantStatus.ACTIVE,
      config: { public: { theme: { color: 'purple', icon: 'beaker' } }, private: {} },
    },
  });

  const nokokoUsers = [
    {
      email: 'admin@nokoko.com',
      role: Role.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      name: 'Nokoko Super Admin',
    },
  ];

  for (const u of nokokoUsers) {
    await prisma.user.upsert({
      where: { email_tenantId: { email: u.email, tenantId: nokokoLabs.id } },
      update: {},
      create: {
        email: u.email,
        password,
        role: u.role,
        status: u.status,
        tenantId: nokokoLabs.id,
      },
    });
    console.log(`   👤 User created: ${u.name} (${u.email}) - ${u.status}`);
  }

  // --- 5. ThunderCats Lair ---
  console.log('🦁 Creating ThunderCats Lair...');
  const thundercats = await prisma.tenant.upsert({
    where: { slug: 'thundercats-lair' },
    update: {},
    create: {
      name: 'ThunderCats Lair',
      slug: 'thundercats-lair',
      status: TenantStatus.ACTIVE,
      config: { public: { theme: { color: 'orange', icon: 'lion' } }, private: {} },
    },
  });

  // --- 6. Ghostbusters HQ ---
  console.log('👻 Creating Ghostbusters HQ...');
  const ghostbusters = await prisma.tenant.upsert({
    where: { slug: 'ghostbusters-hq' },
    update: {},
    create: {
      name: 'Ghostbusters HQ',
      slug: 'ghostbusters-hq',
      status: TenantStatus.ACTIVE,
      config: { public: { theme: { color: 'yellow', icon: 'ghost' } }, private: {} },
    },
  });

  const sharedUsers = [
    {
      email: 'matiasgaratortiz@gmail.com',
      name: 'Matias Garat',
      tenants: [
        { id: nokokoLabs.id, role: Role.SUPER_ADMIN, status: UserStatus.ACTIVE },
        { id: thundercats.id, role: Role.ADMIN, status: UserStatus.ACTIVE },
        { id: ghostbusters.id, role: Role.USER, status: UserStatus.ACTIVE },
      ],
    },
    {
      email: 'lion-o@thundercats.org',
      name: 'Lion-O',
      tenants: [
        { id: thundercats.id, role: Role.ADMIN, status: UserStatus.ACTIVE },
        { id: ghostbusters.id, role: Role.USER, status: UserStatus.ACTIVE },
      ],
    },
    {
      email: 'cheetara@thundercats.org',
      name: 'Cheetara',
      tenants: [
        { id: thundercats.id, role: Role.USER, status: UserStatus.ACTIVE },
        { id: ghostbusters.id, role: Role.ADMIN, status: UserStatus.PENDING },
      ],
    },
    {
      email: 'venkman@ghostbusters.com',
      name: 'Peter Venkman',
      tenants: [
        { id: ghostbusters.id, role: Role.ADMIN, status: UserStatus.ACTIVE },
        { id: thundercats.id, role: Role.USER, status: UserStatus.SUSPENDED },
      ],
    },
    {
      email: 'slimer@ghostbusters.com',
      name: 'Slimer',
      tenants: [
        { id: ghostbusters.id, role: Role.USER, status: UserStatus.DELETED, deletedAt: new Date() },
        { id: mushroomKingdom.id, role: Role.USER, status: UserStatus.ACTIVE },
      ],
    },
  ];

  for (const u of sharedUsers) {
    for (const t of u.tenants) {
      await prisma.user.upsert({
        where: { email_tenantId: { email: u.email, tenantId: t.id } },
        update: {},
        create: {
          email: u.email,
          password,
          role: t.role,
          status: t.status,
          tenantId: t.id,
          deletedAt: (t as { deletedAt?: Date }).deletedAt || null,
        },
      });
      console.log(`   👤 User created: ${u.name} (${u.email}) in tenant ${t.id} - ${t.status}`);
    }
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
