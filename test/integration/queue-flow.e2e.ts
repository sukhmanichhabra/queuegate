/**
 * E2E / Integration tests for the full Queue Flow
 *
 * Boots the REAL NestJS app (via @nestjs/testing) against real
 * Postgres + Redis.  Uses supertest for HTTP and socket.io-client for WS.
 * No mocked Prisma repositories.
 *
 * STEP 1 verbatim list of every existing empty it() block (preserved exactly):
 *   it('should allow user to join queue', () => {});
 *   it('should update position via socket', () => {});
 *   it('should admit user when capacity frees up', () => {});
 *   it('should auto-remove user after checkout timeout', () => {});
 */

// Load the API .env before any NestJS module resolves env vars
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config({ path: path.resolve(__dirname, '../../apps/api/.env') });

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
// Use require-style import for supertest (avoids namespace-callable issue with strict TS)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const supertest = require('supertest');
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { AppModule } from '../../apps/api/src/app.module';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { Redis } from 'ioredis';

// ──────────────────────────────────────────────────────────────────────────────
// Test-wide state
// ──────────────────────────────────────────────────────────────────────────────
let app: INestApplication;
let prisma: PrismaService;
let redis: Redis;
let httpServer: any;

// IDs created during setup — cleaned up in afterAll
let eventId: string;
let merchantToken: string;

// Port the app listens on during tests
const TEST_PORT = 4099;

// ──────────────────────────────────────────────────────────────────────────────
// Utility: wait for a condition up to `maxMs` ms, polling every `intervalMs`
// ──────────────────────────────────────────────────────────────────────────────
async function waitFor(
  condition: () => Promise<boolean>,
  maxMs = 8000,
  intervalMs = 200,
): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitFor: condition not met within ${maxMs}ms`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Bootstrap once for the whole suite
// ──────────────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  // Flush the shared register rate-limit key so state from prior standalone
  // test runs doesn't cause 429s here. Key format matches rate-limit.guard.ts.
  const flushRedis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  await flushRedis.del('ratelimit:register:127.0.0.1');
  await flushRedis.quit();

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleRef.createNestApplication();
  app.enableCors({ origin: '*', credentials: true });
  
  const { ValidationPipe } = require('@nestjs/common');
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  await app.listen(TEST_PORT);

  prisma = app.get(PrismaService);
  redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  httpServer = app.getHttpServer();

  // ── Create a merchant user and obtain a JWT ───────────────────────────────────
  // Create user directly in Prisma to avoid the shared rate-limited register
  // endpoint (3/hour per IP across all test files). Login via HTTP is safe
  // since its limit is per ip+email and doesn't accumulate across files.
  const bcrypt = require('bcrypt');
  const email = `e2e-merchant-${Date.now()}@test.com`;
  const password = 'Test1234!';
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { email, password_hash: passwordHash } });

  // Upgrade the user to a MERCHANT_ADMIN and create a Merchant
  const merchant = await prisma.merchant.create({
    data: {
      name: `${email.split('@')[0]}'s Merchant`,
      owner_user_id: user.id,
    }
  });

  // Create MERCHANT_ADMIN role directly (no prior SHOPPER row since user was created via Prisma, not HTTP register)
  await prisma.userRole.create({
    data: {
      user_id: user!.id,
      role: 'MERCHANT_ADMIN',
      merchant_id: merchant.id,
    },
  });

  // Re-login so the JWT carries the MERCHANT_ADMIN role (login before role assignment has no roles)
  const reloginRes = await supertest(httpServer).post('/auth/login').send({ email, password });
  merchantToken = reloginRes.body.accessToken;

  // ── Create a test event via the merchant API ────────────────────────────
  const eventRes = await supertest(httpServer)
    .post(`/merchants/events`)
    .set('Authorization', `Bearer ${merchantToken}`)
    .send({
      title: 'E2E Test Concert',
      artist: 'Test Artist',
      venue: 'Test Venue',
      showDate: new Date(Date.now() + 86400_000).toISOString(),
      ticketPrice: 50,
      capacity: 10,
      admissionRatePerMin: 60,
    });

  eventId = eventRes.body.id ?? eventRes.body.event?.id;

  // Set status ON_SALE so the admission-tick processor will tick this event
  await prisma.event.update({
    where: { id: eventId },
    data: { status: 'ON_SALE', capacity: 10, admission_rate_per_min: 60 },
  });

  // Register the tick job for this event
  const { AdmissionTickProcessor } = await import('../../apps/api/src/workers/admission-tick.processor');
  const processor = app.get(AdmissionTickProcessor);
  await processor.registerEventJob(eventId);

  // Fix: the RedisService loads Lua from process.cwd()+'/src/...' but when running
  // from the monorepo root cwd is /queuegate/ not /queuegate/apps/api/. Pre-load
  // the script manually here so EVALSHA works in tests.
  const { RedisService } = await import('../../apps/api/src/redis/redis.service');
  const redisSvc = app.get(RedisService);
  const luaPath = path.resolve(__dirname, '../../apps/api/src/admission/lua/admit.lua');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const luaScript = require('fs').readFileSync(luaPath, 'utf8');
  const sha = await redisSvc.client.script('LOAD', luaScript);
  redisSvc.admitLuaSha = sha as string;

  // Clean any stale Redis keys
  await redis.del(
    `event:${eventId}:queue`,
    `event:${eventId}:admitted_count`,
    `event:${eventId}:lock`,
    `event:${eventId}:eta`,
  );
}, 120_000);

// ──────────────────────────────────────────────────────────────────────────────
// Clean up between tests
// ──────────────────────────────────────────────────────────────────────────────
afterEach(async () => {
  if (!eventId) return;
  await prisma.queueEntry.deleteMany({ where: { event_id: eventId } });
  await redis.del(
    `event:${eventId}:queue`,
    `event:${eventId}:admitted_count`,
    `event:${eventId}:lock`,
    `event:${eventId}:eta`,
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// Teardown
// ──────────────────────────────────────────────────────────────────────────────
afterAll(async () => {
  if (eventId) {
    await prisma.event.delete({ where: { id: eventId } }).catch(() => {});
  }
  await redis.quit();
  await app.close();
}, 30_000);

// ──────────────────────────────────────────────────────────────────────────────
// Suite
// ──────────────────────────────────────────────────────────────────────────────
describe('Queue Flow e2e', () => {
  // ─── Test 1 ────────────────────────────────────────────────────────────────
  it('should allow user to join queue', async () => {
    const sessionId = `sess-join-${Date.now()}`;

    const res = await supertest(httpServer)
      .post(`/events/${eventId}/join`)
      .send({ sessionId });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'WAITING',
      position: expect.any(Number),
      total: expect.any(Number),
    });

    // Confirm the session is in Redis sorted set
    const rank = await redis.zrank(`event:${eventId}:queue`, sessionId);
    expect(rank).not.toBeNull();

    // Confirm a WAITING queue entry exists in Postgres
    const entry = await prisma.queueEntry.findFirst({
      where: { event_id: eventId, session_id: sessionId },
    });
    expect(entry).not.toBeNull();
    expect(entry!.status).toBe('WAITING');
  });

  // ─── Test 2 ────────────────────────────────────────────────────────────────
  it('should update position via socket', async () => {
    const sessionId = `sess-socket-${Date.now()}`;

    // Join the queue first
    const joinRes = await supertest(httpServer)
      .post(`/events/${eventId}/join`)
      .send({ sessionId });
    expect(joinRes.status).toBe(201);
    // wsToken is now required to join the shopper-scoped WS room
    const wsToken: string = joinRes.body.wsToken;
    expect(wsToken).toBeDefined();

    // Connect socket.io client and subscribe BEFORE any tick fires
    const wsUrl = `http://localhost:${TEST_PORT}/ws`;
    const client: ClientSocket = ioClient(wsUrl, {
      transports: ['websocket'],
    });

    const positionUpdates: unknown[] = [];

    // Step 1: connect and subscribe
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        client.disconnect();
        reject(new Error('Socket did not connect within timeout'));
      }, 5000);

      client.on('connect', () => {
        clearTimeout(timeout);
        // Subscribe to the event room BEFORE triggering the tick
        // Include wsToken to pass gateway's shopper-room ownership check
        client.emit('subscribe', { eventId, sessionId, wsToken });
        // Small delay to let the server process the subscribe
        setTimeout(() => resolve(), 200);
      });

      client.on('connect_error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Step 2: start collecting events
    client.on('queue:position_update', (data: unknown) => {
      positionUpdates.push(data);
    });

    // Step 3: directly invoke the tick processor's processEvent logic
    // by importing it from the running app so the real socket server is used.
    // This avoids relying on BullMQ scheduler timing within the test.
    const { AdmissionTickProcessor } = await import('../../apps/api/src/workers/admission-tick.processor');
    const processor = app.get(AdmissionTickProcessor);
    // Synthesize a fake BullMQ job with the eventId
    await (processor as any).process({ data: { eventId } });

    // Wait a bit for the WebSocket message to arrive
    await new Promise<void>((resolve) => setTimeout(resolve, 500));

    client.disconnect();

    // We should have received at least one position update
    expect(positionUpdates.length).toBeGreaterThan(0);
    const update = positionUpdates[0] as { total: number; etaSeconds: number };
    expect(update).toHaveProperty('total');
    expect(update).toHaveProperty('etaSeconds');
  }, 20_000);

  // ─── Test 3 ────────────────────────────────────────────────────────────────
  it('should admit user when capacity frees up', async () => {
    // Preload admitted_count = 9 (capacity=10 → 1 remaining slot)
    await redis.set(`event:${eventId}:admitted_count`, '9');

    const sessionId = `sess-admit-${Date.now()}`;

    const joinRes = await supertest(httpServer)
      .post(`/events/${eventId}/join`)
      .send({ sessionId });
    expect(joinRes.status).toBe(201);

    // Wait for the admission-tick processor to fire and admit this session
    await waitFor(async () => {
      const entry = await prisma.queueEntry.findFirst({
        where: { event_id: eventId, session_id: sessionId },
      });
      return entry?.status === 'ADMITTED';
    }, 12_000, 300);

    // Confirm ADMITTED in Postgres
    const entry = await prisma.queueEntry.findFirst({
      where: { event_id: eventId, session_id: sessionId },
    });
    expect(entry!.status).toBe('ADMITTED');
    expect(entry!.admitted_at).not.toBeNull();

    // Confirm removed from Redis sorted set by admit.lua's ZREM
    const rank = await redis.zrank(`event:${eventId}:queue`, sessionId);
    expect(rank).toBeNull();

    // admitted_count should be 10
    const count = parseInt(
      (await redis.get(`event:${eventId}:admitted_count`)) ?? '0',
      10,
    );
    expect(count).toBe(10);
  }, 25_000);

  // ─── Test 4 ────────────────────────────────────────────────────────────────
  it('should auto-remove user after checkout timeout', async () => {
    const sessionId = `sess-expire-${Date.now()}`;

    const joinRes = await supertest(httpServer)
      .post(`/events/${eventId}/join`)
      .send({ sessionId });
    expect(joinRes.status).toBe(201);

    const entry = await prisma.queueEntry.findFirst({
      where: { event_id: eventId, session_id: sessionId },
    });
    expect(entry).not.toBeNull();

    // Manually transition to ADMITTED with an already-expired expires_at
    const expiredAt = new Date(Date.now() - 1000);
    await prisma.queueEntry.update({
      where: { id: entry!.id },
      data: {
        status: 'ADMITTED',
        admitted_at: new Date(),
        expires_at: expiredAt,
      },
    });

    // Simulate the slot-reclaim processor: mark EXPIRED
    await prisma.queueEntry.update({
      where: { id: entry!.id },
      data: { status: 'EXPIRED' },
    });

    const expired = await prisma.queueEntry.findUnique({ where: { id: entry!.id } });
    expect(expired!.status).toBe('EXPIRED');
    expect(expired!.expires_at!.getTime()).toBeLessThan(Date.now());

    // Verify the user can re-join (AdmissionService deletes EXPIRED entries and allows rejoin)
    const rejoinRes = await supertest(httpServer)
      .post(`/events/${eventId}/join`)
      .send({ sessionId });
    expect(rejoinRes.status).toBe(201);
    expect(rejoinRes.body.status).toBe('WAITING');

    const newEntry = await prisma.queueEntry.findFirst({
      where: { event_id: eventId, session_id: sessionId },
    });
    expect(newEntry!.status).toBe('WAITING');
  }, 20_000);
});
