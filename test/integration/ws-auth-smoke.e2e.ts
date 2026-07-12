/**
 * ws-auth-smoke.e2e.ts
 *
 * Real socket.io-client smoke tests for WS auth hardening (runs via jest e2e config).
 * Tests the four key scenarios:
 *   (A) Shopper with valid wsToken → joins shopper room, receives queue:position_update
 *   (B) Attacker with no/wrong wsToken → rejected from shopper room, no shopper events
 *   (C) Merchant with valid MERCHANT_ADMIN JWT for correct event → joins merchant room
 *   (D) Connection with no auth / wrong-merchant JWT → rejected from merchant room
 */

// Load API env
import * as path from 'path';
import * as fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config({ path: path.resolve(__dirname, '../../apps/api/.env') });

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const supertest = require('supertest');
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { AppModule } from '../../apps/api/src/app.module';
import { PrismaService } from '../../apps/api/src/prisma/prisma.service';
import { Redis } from 'ioredis';

const TEST_PORT = 4097;
const WS_URL = `http://localhost:${TEST_PORT}/ws`;

let app: INestApplication;
let prisma: PrismaService;
let redis: Redis;
let httpServer: any;

let eventId: string;
let merchantToken: string;
let otherMerchantToken: string;

// ── Helpers ─────────────────────────────────────────────────────────────────
function connectWs(opts?: { auth?: Record<string, unknown> }): ClientSocket {
  return ioClient(WS_URL, {
    transports: ['websocket'],
    ...(opts?.auth ? { auth: opts.auth } : {}),
  });
}

async function socketConnect(client: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Socket did not connect within 5s')), 5000);
    client.on('connect', () => { clearTimeout(t); resolve(); });
    client.on('connect_error', (e: Error) => { clearTimeout(t); reject(e); });
    if (!client.connected) client.connect();
  });
}

// ── Bootstrap ────────────────────────────────────────────────────────────────
beforeAll(async () => {
  // Flush shared rate-limit keys before booting so accumulated state from prior
  // test files (queue-flow runs first) doesn't cause 429s on register calls.
  const flushRedis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  await flushRedis.del('ratelimit:register:127.0.0.1');
  await flushRedis.quit();

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleRef.createNestApplication();
  app.enableCors({ origin: '*', credentials: true });
  const { ValidationPipe } = require('@nestjs/common');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(TEST_PORT);

  prisma = app.get(PrismaService);
  redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  httpServer = app.getHttpServer();

  // Ensure Lua script is loaded (same fix as queue-flow.e2e.ts)
  const { RedisService } = await import('../../apps/api/src/redis/redis.service');
  const redisSvc = app.get(RedisService);
  const luaPath = path.resolve(__dirname, '../../apps/api/src/admission/lua/admit.lua');
  const luaScript = fs.readFileSync(luaPath, 'utf8');
  const sha = await redisSvc.client.script('LOAD', luaScript);
  redisSvc.admitLuaSha = sha as string;

  // Create users directly in Prisma — bypasses the rate-limited register endpoint
  // so this suite isn't affected by queue-flow's earlier register calls.
  const bcrypt = require('bcrypt');

  // Create merchant A (event owner)
  const emailA = `smoke-a-${Date.now()}@test.com`;
  const hashA = await bcrypt.hash('Test1234!', 10);
  const userA = await prisma.user.create({ data: { email: emailA, password_hash: hashA } });
  const merchantA = await prisma.merchant.create({ data: { name: 'Smoke A', owner_user_id: userA.id } });
  // Create MERCHANT_ADMIN role directly (no prior SHOPPER row — user was created via Prisma, not HTTP register)
  await prisma.userRole.create({ data: { user_id: userA.id, role: 'MERCHANT_ADMIN', merchant_id: merchantA.id } });
  // Re-login after role assignment so the JWT carries MERCHANT_ADMIN
  const loginA = await supertest(httpServer).post('/auth/login').send({ email: emailA, password: 'Test1234!' });
  merchantToken = loginA.body.accessToken;

  // Create merchant B (wrong merchant)
  const emailB = `smoke-b-${Date.now()}@test.com`;
  const hashB = await bcrypt.hash('Test1234!', 10);
  const userB = await prisma.user.create({ data: { email: emailB, password_hash: hashB } });
  const merchantB = await prisma.merchant.create({ data: { name: 'Smoke B', owner_user_id: userB.id } });
  // Create MERCHANT_ADMIN role directly
  await prisma.userRole.create({ data: { user_id: userB.id, role: 'MERCHANT_ADMIN', merchant_id: merchantB.id } });
  // Re-login after role assignment
  const loginB = await supertest(httpServer).post('/auth/login').send({ email: emailB, password: 'Test1234!' });
  otherMerchantToken = loginB.body.accessToken;

  // Create event owned by merchant A
  const evtRes = await supertest(httpServer)
    .post('/merchants/events')
    .set('Authorization', `Bearer ${merchantToken}`)
    .send({ title: 'Smoke Event', artist: 'Smoke Artist', venue: 'Smoke Venue', showDate: new Date(Date.now() + 86400_000).toISOString(), ticketPrice: 50, capacity: 10, admissionRatePerMin: 60 });
  eventId = evtRes.body.id;
  await prisma.event.update({ where: { id: eventId }, data: { status: 'ON_SALE' } });
}, 120_000);

afterAll(async () => {
  if (eventId) await prisma.event.delete({ where: { id: eventId } }).catch(() => {});
  await redis.quit();
  await app.close();
}, 30_000);

afterEach(async () => {
  if (!eventId) return;
  await prisma.queueEntry.deleteMany({ where: { event_id: eventId } });
  await redis.del(`event:${eventId}:queue`, `event:${eventId}:admitted_count`, `event:${eventId}:lock`, `event:${eventId}:eta`);
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('WS Auth Smoke Tests', () => {

  // ── Scenario A ────────────────────────────────────────────────────────────
  it('[A] Shopper with valid wsToken joins shopper room and receives position_update', async () => {
    const sessionId = `smoke-sess-${Date.now()}`;
    const joinRes = await supertest(httpServer).post(`/events/${eventId}/join`).send({ sessionId });
    expect(joinRes.status).toBe(201);

    const wsToken: string = joinRes.body.wsToken;
    expect(wsToken).toBeDefined();
    expect(typeof wsToken).toBe('string');
    console.log(`   wsToken prefix: ${wsToken.substring(0, 40)}…`);

    const client = connectWs();
    await socketConnect(client);

    const errors: any[] = [];
    client.on('subscribe:error', (e: any) => errors.push(e));

    // Subscribe WITH valid wsToken
    client.emit('subscribe', { eventId, sessionId, wsToken });
    await new Promise((r) => setTimeout(r, 400));

    const shopperErrors = errors.filter((e) => e.room === 'shopper');
    expect(shopperErrors).toHaveLength(0); // no rejection

    // Trigger tick to get position update
    const { AdmissionTickProcessor } = await import('../../apps/api/src/workers/admission-tick.processor');
    const processor = app.get(AdmissionTickProcessor);

    const updates: unknown[] = [];
    client.on('queue:position_update', (d: unknown) => updates.push(d));
    await (processor as any).process({ data: { eventId } });
    await new Promise((r) => setTimeout(r, 500));

    client.disconnect();

    expect(updates.length).toBeGreaterThan(0);
    const update = updates[0] as any;
    expect(update).toHaveProperty('total');
    expect(update).toHaveProperty('etaSeconds');
    console.log(`   ✅ Received position_update: ${JSON.stringify(update)}`);
  }, 20_000);

  // ── Scenario B ────────────────────────────────────────────────────────────
  it('[B] Attacker with no wsToken is rejected from shopper room and cannot receive victim events', async () => {
    // Victim joins legitimately
    const victimSid = `smoke-victim-${Date.now()}`;
    const victimJoin = await supertest(httpServer).post(`/events/${eventId}/join`).send({ sessionId: victimSid });
    expect(victimJoin.status).toBe(201);
    const victimToken: string = victimJoin.body.wsToken;

    // Attacker connects with NO wsToken, tries to join victim's shopper room
    const attacker = connectWs();
    await socketConnect(attacker);
    const attackerErrors: any[] = [];
    attacker.on('subscribe:error', (e: any) => attackerErrors.push(e));

    attacker.emit('subscribe', { eventId, sessionId: victimSid }); // no wsToken
    await new Promise((r) => setTimeout(r, 400));

    const shopperRejected = attackerErrors.some((e) => e.room === 'shopper');
    expect(shopperRejected).toBe(true); // attacker was rejected
    console.log(`   Attacker rejected from shopper room ✅`);

    // Victim connects with real token
    const victim = connectWs();
    await socketConnect(victim);
    victim.emit('subscribe', { eventId, sessionId: victimSid, wsToken: victimToken });
    await new Promise((r) => setTimeout(r, 400));

    // Now emit admitted directly to shopper room; attacker must NOT receive it
    const attackerAdmitted: unknown[] = [];
    attacker.on('queue:admitted', () => attackerAdmitted.push('admitted'));

    const { QueueGateway } = await import('../../apps/api/src/ws-gateway/queue.gateway');
    const gateway = app.get(QueueGateway);
    gateway.emitAdmitted(eventId, victimSid, { checkoutToken: 'TEST_TOKEN', expiresAt: new Date().toISOString(), entryId: 'fake' });
    await new Promise((r) => setTimeout(r, 400));

    attacker.disconnect();
    victim.disconnect();

    // CORE FRAUD SCENARIO: attacker must receive 0 victim events
    expect(attackerAdmitted).toHaveLength(0);
    console.log(`   Attacker received 0 victim events ✅ — fraud scenario CLOSED`);
  }, 20_000);

  // ── Scenario C ────────────────────────────────────────────────────────────
  it('[C] Merchant with valid MERCHANT_ADMIN JWT joins merchant room and receives live_stats', async () => {
    // Connect with merchant A's JWT in socket.handshake.auth
    const merchantClient = connectWs({ auth: { token: merchantToken } });
    await socketConnect(merchantClient);

    const errors: any[] = [];
    merchantClient.on('subscribe:error', (e: any) => errors.push(e));
    merchantClient.emit('subscribe', { eventId, role: 'merchant' });
    await new Promise((r) => setTimeout(r, 500));

    const merchantErrors = errors.filter((e) => e.room === 'merchant');
    expect(merchantErrors).toHaveLength(0); // no rejection
    console.log(`   Merchant joined merchant room ✅`);

    const statsReceived: unknown[] = [];
    merchantClient.on('merchant:live_stats', (d: unknown) => statsReceived.push(d));

    const { QueueGateway } = await import('../../apps/api/src/ws-gateway/queue.gateway');
    const gateway = app.get(QueueGateway);
    gateway.emitMerchantStats(eventId, { queueDepth: 5, admissionRate: 60, throttleActive: false });
    await new Promise((r) => setTimeout(r, 400));

    merchantClient.disconnect();

    expect(statsReceived.length).toBeGreaterThan(0);
    console.log(`   Received merchant:live_stats: ${JSON.stringify(statsReceived[0])} ✅`);
  }, 20_000);

  // ── Scenario D ────────────────────────────────────────────────────────────
  it('[D] No auth / wrong-merchant JWT are rejected from merchant room', async () => {
    // D1: No auth at all
    const noAuth = connectWs();
    await socketConnect(noAuth);
    const noAuthErrors: any[] = [];
    noAuth.on('subscribe:error', (e: any) => noAuthErrors.push(e));
    noAuth.emit('subscribe', { eventId, role: 'merchant' });
    await new Promise((r) => setTimeout(r, 400));
    noAuth.disconnect();

    const noAuthRejected = noAuthErrors.some((e) => e.room === 'merchant');
    expect(noAuthRejected).toBe(true);
    console.log(`   No-auth client rejected ✅`);

    // D2: Valid JWT for a DIFFERENT merchant (Merchant B)
    const wrongMerchant = connectWs({ auth: { token: otherMerchantToken } });
    await socketConnect(wrongMerchant);
    const wrongErrors: any[] = [];
    wrongMerchant.on('subscribe:error', (e: any) => wrongErrors.push(e));
    wrongMerchant.emit('subscribe', { eventId, role: 'merchant' });
    await new Promise((r) => setTimeout(r, 600));
    wrongMerchant.disconnect();

    const wrongRejected = wrongErrors.some((e) => e.room === 'merchant');
    expect(wrongRejected).toBe(true);
    console.log(`   Wrong-merchant JWT rejected ✅ (correct ownership check)`);
  }, 20_000);

});
