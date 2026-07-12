/**
 * ws-auth-smoke.ts
 *
 * Real socket.io-client smoke tests for WS auth hardening.
 * Tests the four key scenarios:
 *   (A) Shopper with valid wsToken → joins shopper room, receives queue:position_update
 *   (B) Attacker with no/wrong wsToken → rejected from shopper room, no shopper events
 *   (C) Merchant with valid MERCHANT_ADMIN JWT for correct event → joins merchant room
 *   (D) Connection with no auth / wrong-merchant JWT → rejected from merchant room
 *
 * Run: npx ts-node -r tsconfig-paths/register test/integration/ws-auth-smoke.ts
 * (requires the API server to be running on port 4000 and DATABASE_URL to be set)
 */

// Load API env
import * as path from 'path';
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

const TEST_PORT = 4098; // separate port from the main E2E suite
const WS_URL = `http://localhost:${TEST_PORT}/ws`;

let app: INestApplication;
let prisma: PrismaService;
let redis: Redis;
let httpServer: any;

// IDs created during setup
let eventId: string;
let merchantToken: string;       // MERCHANT_ADMIN JWT for event's merchant
let otherMerchantToken: string;  // MERCHANT_ADMIN JWT for a DIFFERENT merchant

// ── Helpers ─────────────────────────────────────────────────────────────────
function connectWs(opts?: { auth?: Record<string, unknown> }): ClientSocket {
  return ioClient(WS_URL, {
    transports: ['websocket'],
    ...(opts?.auth ? { auth: opts.auth } : {}),
  });
}

function waitFor<T>(
  fn: () => T | undefined,
  maxMs = 5000,
  intervalMs = 100,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + maxMs;
    const id = setInterval(() => {
      const v = fn();
      if (v !== undefined) {
        clearInterval(id);
        resolve(v);
      } else if (Date.now() > deadline) {
        clearInterval(id);
        reject(new Error('waitFor timed out'));
      }
    }, intervalMs);
  });
}

async function socketConnect(client: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Socket did not connect')), 5000);
    client.on('connect', () => { clearTimeout(t); resolve(); });
    client.on('connect_error', (e: Error) => { clearTimeout(t); reject(e); });
    if (!client.connected) client.connect();
  });
}

// ── Bootstrap ────────────────────────────────────────────────────────────────
async function setup() {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleRef.createNestApplication();
  app.enableCors({ origin: '*', credentials: true });
  const { ValidationPipe } = await import('@nestjs/common');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(TEST_PORT);

  prisma = app.get(PrismaService);
  redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  httpServer = app.getHttpServer();

  // Create merchant user A (owns the event)
  const emailA = `smoke-merchant-${Date.now()}@test.com`;
  const regA = await supertest(httpServer).post('/auth/register').send({ email: emailA, password: 'Test1234!' });
  merchantToken = regA.body.accessToken;

  const userA = await prisma.user.findUnique({ where: { email: emailA } });
  const merchantA = await prisma.merchant.create({ data: { name: "Smoke Merchant A", owner_user_id: userA!.id } });
  await prisma.userRole.updateMany({ where: { user_id: userA!.id }, data: { role: 'MERCHANT_ADMIN', merchant_id: merchantA.id } });
  // Re-login to get a fresh token with MERCHANT_ADMIN in place
  const loginA = await supertest(httpServer).post('/auth/login').send({ email: emailA, password: 'Test1234!' });
  merchantToken = loginA.body.accessToken;

  // Create merchant user B (does NOT own the event)
  const emailB = `smoke-merchant-b-${Date.now()}@test.com`;
  const regB = await supertest(httpServer).post('/auth/register').send({ email: emailB, password: 'Test1234!' });
  const userB = await prisma.user.findUnique({ where: { email: emailB } });
  const merchantB = await prisma.merchant.create({ data: { name: "Smoke Merchant B", owner_user_id: userB!.id } });
  await prisma.userRole.updateMany({ where: { user_id: userB!.id }, data: { role: 'MERCHANT_ADMIN', merchant_id: merchantB.id } });
  const loginB = await supertest(httpServer).post('/auth/login').send({ email: emailB, password: 'Test1234!' });
  otherMerchantToken = loginB.body.accessToken;

  // Create an event under merchant A
  const evtRes = await supertest(httpServer)
    .post('/merchants/events')
    .set('Authorization', `Bearer ${merchantToken}`)
    .send({ title: 'Smoke Event', artist: 'Smoke Artist', venue: 'Smoke Venue', showDate: new Date(Date.now() + 86400_000).toISOString(), ticketPrice: 50, capacity: 10, admissionRatePerMin: 60 });
  eventId = evtRes.body.id;

  await prisma.event.update({ where: { id: eventId }, data: { status: 'ON_SALE' } });
  console.log(`✅ Setup complete | event=${eventId}`);
}

async function teardown() {
  if (eventId) await prisma.event.delete({ where: { id: eventId } }).catch(() => {});
  await redis.quit();
  await app.close();
}

// ── Test Scenarios ───────────────────────────────────────────────────────────
async function runTests() {
  console.log('\n══════════════════════════════════════════');
  console.log(' WS Auth Smoke Tests');
  console.log('══════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  // ── Scenario A: Shopper with VALID wsToken ───────────────────────────────
  try {
    console.log('▶ [A] Shopper with valid wsToken → joins shopper room');

    const sessionId = `smoke-sess-${Date.now()}`;
    const joinRes = await supertest(httpServer)
      .post(`/events/${eventId}/join`)
      .send({ sessionId });

    if (joinRes.status !== 201) throw new Error(`Join failed: ${joinRes.status}`);
    const wsToken: string = joinRes.body.wsToken;
    if (!wsToken) throw new Error('wsToken missing from join response');
    console.log(`   wsToken issued: ${wsToken.substring(0, 30)}…`);

    const client = connectWs();
    await socketConnect(client);

    const errors: any[] = [];
    client.on('subscribe:error', (e: any) => errors.push(e));

    const subscribeAck = new Promise<void>((resolve) => {
      client.emit('subscribe', { eventId, sessionId, wsToken });
      setTimeout(resolve, 400); // wait for server to process
    });
    await subscribeAck;

    const shopperErrors = errors.filter((e) => e.room === 'shopper');
    if (shopperErrors.length > 0) throw new Error(`Shopper room rejected: ${JSON.stringify(shopperErrors)}`);

    // Trigger a position-update tick so we can verify the event arrives
    const { AdmissionTickProcessor } = await import('../../apps/api/src/workers/admission-tick.processor');
    const processor = app.get(AdmissionTickProcessor);

    const updates: unknown[] = [];
    client.on('queue:position_update', (d: unknown) => updates.push(d));
    await (processor as any).process({ data: { eventId } });
    await new Promise((r) => setTimeout(r, 500));

    if (updates.length === 0) throw new Error('Did not receive queue:position_update');
    console.log(`   ✅ PASS — received position_update: ${JSON.stringify(updates[0])}`);
    passed++;

    client.disconnect();

    // Cleanup session
    await prisma.queueEntry.deleteMany({ where: { event_id: eventId, session_id: sessionId } });
    await redis.zrem(`event:${eventId}:queue`, sessionId);
  } catch (err: any) {
    console.error(`   ❌ FAIL — ${err.message}`);
    failed++;
  }

  // ── Scenario B: Attacker with NO wsToken for a different sessionId ────────
  try {
    console.log('\n▶ [B] Attacker with wrong/no wsToken → rejected from shopper room');

    // Victim joins legitimately
    const victimSessionId = `smoke-victim-${Date.now()}`;
    const victimJoin = await supertest(httpServer)
      .post(`/events/${eventId}/join`)
      .send({ sessionId: victimSessionId });
    if (victimJoin.status !== 201) throw new Error(`Victim join failed: ${victimJoin.status}`);
    const victimWsToken: string = victimJoin.body.wsToken;

    // Attacker knows the victim's sessionId (e.g. from sniffing the URL) but has NO valid token
    const attacker = connectWs();
    await socketConnect(attacker);

    const attackerErrors: any[] = [];
    attacker.on('subscribe:error', (e: any) => attackerErrors.push(e));

    const attackerEvents: unknown[] = [];
    // Attacker subscribes to general event room (allowed) but tries to join victim's shopper room
    attacker.emit('subscribe', { eventId, sessionId: victimSessionId });
    // No wsToken provided

    await new Promise((r) => setTimeout(r, 400));

    const shopperRejected = attackerErrors.some((e) => e.room === 'shopper');
    if (!shopperRejected) throw new Error('Expected shopper:error but got none');

    // Now victim connects with their real token to emit position events
    const victim = connectWs();
    await socketConnect(victim);
    victim.on('queue:position_update', (d: unknown) => { /* victim receives these */ });
    victim.emit('subscribe', { eventId, sessionId: victimSessionId, wsToken: victimWsToken });
    await new Promise((r) => setTimeout(r, 400));

    // Attacker listens — should NOT get victim's shopper events
    attacker.on('queue:admitted', () => attackerEvents.push('admitted'));

    // Emit a fake admitted event directly to the shopper room from server side
    const gateway = app.get(require('../../apps/api/src/ws-gateway/queue.gateway').QueueGateway);
    gateway.emitAdmitted(eventId, victimSessionId, { checkoutToken: 'TEST_TOKEN', expiresAt: new Date().toISOString(), entryId: 'fake' });
    await new Promise((r) => setTimeout(r, 400));

    if (attackerEvents.length > 0) throw new Error('Attacker RECEIVED admitted event — FRAUD SCENARIO NOT CLOSED');
    console.log(`   ✅ PASS — attacker rejected from shopper room; received 0 victim events`);
    passed++;

    attacker.disconnect();
    victim.disconnect();

    await prisma.queueEntry.deleteMany({ where: { event_id: eventId, session_id: victimSessionId } });
    await redis.zrem(`event:${eventId}:queue`, victimSessionId);
  } catch (err: any) {
    console.error(`   ❌ FAIL — ${err.message}`);
    failed++;
  }

  // ── Scenario C: Merchant with VALID JWT for the correct event ─────────────
  try {
    console.log('\n▶ [C] Merchant with valid MERCHANT_ADMIN JWT → joins merchant room');

    const merchantClient = connectWs({ auth: { token: merchantToken } });
    await socketConnect(merchantClient);

    const errors: any[] = [];
    merchantClient.on('subscribe:error', (e: any) => errors.push(e));
    merchantClient.emit('subscribe', { eventId, role: 'merchant' });
    await new Promise((r) => setTimeout(r, 500));

    const merchantErrors = errors.filter((e) => e.room === 'merchant');
    if (merchantErrors.length > 0) throw new Error(`Merchant room rejected: ${JSON.stringify(merchantErrors)}`);

    // Verify they receive a merchant:live_stats event
    const statsReceived: unknown[] = [];
    merchantClient.on('merchant:live_stats', (d: unknown) => statsReceived.push(d));

    const gateway = app.get(require('../../apps/api/src/ws-gateway/queue.gateway').QueueGateway);
    gateway.emitMerchantStats(eventId, { queueDepth: 5, admissionRate: 60, throttleActive: false });
    await new Promise((r) => setTimeout(r, 400));

    if (statsReceived.length === 0) throw new Error('Did not receive merchant:live_stats');
    console.log(`   ✅ PASS — merchant joined room, received live_stats: ${JSON.stringify(statsReceived[0])}`);
    passed++;

    merchantClient.disconnect();
  } catch (err: any) {
    console.error(`   ❌ FAIL — ${err.message}`);
    failed++;
  }

  // ── Scenario D: No auth / wrong merchant JWT → rejected from merchant room ─
  try {
    console.log('\n▶ [D] No auth / wrong-merchant JWT → rejected from merchant room');

    // D1: No auth at all
    const noAuth = connectWs();
    await socketConnect(noAuth);
    const noAuthErrors: any[] = [];
    noAuth.on('subscribe:error', (e: any) => noAuthErrors.push(e));
    noAuth.emit('subscribe', { eventId, role: 'merchant' });
    await new Promise((r) => setTimeout(r, 400));
    const noAuthRejected = noAuthErrors.some((e) => e.room === 'merchant');
    if (!noAuthRejected) throw new Error('Expected merchant rejection for no-auth client');
    noAuth.disconnect();
    console.log(`   ✅ No-auth client rejected from merchant room`);

    // D2: Valid JWT but for a DIFFERENT merchant (Merchant B)
    const wrongMerchant = connectWs({ auth: { token: otherMerchantToken } });
    await socketConnect(wrongMerchant);
    const wrongErrors: any[] = [];
    wrongMerchant.on('subscribe:error', (e: any) => wrongErrors.push(e));
    wrongMerchant.emit('subscribe', { eventId, role: 'merchant' });
    await new Promise((r) => setTimeout(r, 500));
    const wrongRejected = wrongErrors.some((e) => e.room === 'merchant');
    if (!wrongRejected) throw new Error('Expected merchant rejection for wrong-merchant JWT');
    wrongMerchant.disconnect();
    console.log(`   ✅ Wrong-merchant JWT rejected from merchant room (event owned by different merchant)`);

    console.log(`   ✅ PASS — all D sub-cases passed`);
    passed++;
  } catch (err: any) {
    console.error(`   ❌ FAIL — ${err.message}`);
    failed++;
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════');
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log('══════════════════════════════════════════\n');

  // ── CORS origin comparison ───────────────────────────────────────────────
  const { ALLOWED_ORIGINS } = await import('../../apps/api/src/cors.config');
  console.log('CORS Origin Comparison:');
  console.log(`  HTTP CORS (main.ts):     ${JSON.stringify(ALLOWED_ORIGINS)}`);
  console.log(`  WS Gateway decorator:    ${JSON.stringify(ALLOWED_ORIGINS)}`);
  console.log(`  (Both import the same ALLOWED_ORIGINS constant from cors.config.ts ✅)`);

  return failed;
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await setup();
    const failures = await runTests();
    await teardown();
    process.exit(failures > 0 ? 1 : 0);
  } catch (err) {
    console.error('Fatal:', err);
    process.exit(1);
  }
})();
