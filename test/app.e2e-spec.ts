import { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('status', 'OK');
        expect(res.body).toHaveProperty('timestamp');
      });
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
        expect(res.body.info?.database?.status).toBe('up');
      });
  });
});

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const testUserEmail = 'auth-e2e@example.com';
  const testUserPassword = 'e2e-password-123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const tenant = await prisma.tenant.upsert({
      where: { slug: 'e2e-auth' },
      create: { name: 'E2E Auth Tenant', slug: 'e2e-auth', isActive: true },
      update: {},
    });

    const hashedPassword = bcrypt.hashSync(testUserPassword, 10);
    await prisma.user.upsert({
      where: { email: testUserEmail },
      create: {
        email: testUserEmail,
        password: hashedPassword,
        role: 'USER',
        tenantId: tenant.id,
      },
      update: { password: hashedPassword },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/login returns 201 and access_token with valid credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testUserEmail, password: testUserPassword })
      .expect(201);
    expect(res.body).toHaveProperty('access_token');
    expect(typeof res.body.access_token).toBe('string');
  });

  it('POST /auth/login returns 401 with invalid password', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testUserEmail, password: 'wrong-password' })
      .expect(401);
  });

  it('GET /auth/me returns 401 without token', () => {
    return request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('GET /auth/me returns 200 and user payload with valid token', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testUserEmail, password: testUserPassword })
      .expect(201);
    const token = loginRes.body.access_token as string;

    const meRes = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(meRes.body).toMatchObject({
      email: testUserEmail,
      role: 'USER',
    });
    expect(meRes.body).toHaveProperty('sub');
    expect(meRes.body).toHaveProperty('tenantId');
  });
});
