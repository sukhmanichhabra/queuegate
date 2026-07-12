/**
 * Unit tests for admit.lua
 *
 * These tests call the REAL Lua script via redis.eval() against a real
 * Redis instance (localhost:6379). No mocks.
 *
 * STEP 1 verbatim list of every existing empty it() block (preserved exactly):
 *   it('should admit candidates up to capacity', () => {});
 *   it('should not admit if at capacity', () => {});
 *   it('should admit partial if close to capacity', () => {});
 *   it('should do nothing if queue is empty', () => {});
 *   it('should correctly increment admitted count', () => {});
 */

import * as fs from 'fs';
import * as path from 'path';
import { Redis } from 'ioredis';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const LUA_PATH = path.resolve(
  __dirname,
  '../../apps/api/src/admission/lua/admit.lua',
);

function loadLua(): string {
  return fs.readFileSync(LUA_PATH, 'utf8');
}

/**
 * Run admit.lua via EVAL against Redis.
 * Returns the array of admitted session IDs.
 */
async function runAdmit(
  redis: Redis,
  script: string,
  queueKey: string,
  countKey: string,
  slots: number,
  capacity: number,
): Promise<string[]> {
  const result = await redis.eval(
    script,
    2,
    queueKey,
    countKey,
    slots,
    capacity,
  );
  return (result as string[]) ?? [];
}

// ──────────────────────────────────────────────────────────────────────────────
// Suite
// ──────────────────────────────────────────────────────────────────────────────

describe('admit.lua', () => {
  let redis: Redis;
  let luaScript: string;

  // Each test gets its own key namespace so tests are isolated
  let queueKey: string;
  let countKey: string;
  let testId: number;

  beforeAll(() => {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      lazyConnect: false,
    });
    luaScript = loadLua();
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    // Fresh namespace per test
    testId = Date.now() + Math.floor(Math.random() * 1000);
    queueKey = `test:admit:${testId}:queue`;
    countKey = `test:admit:${testId}:admitted_count`;
    // Ensure clean state
    await redis.del(queueKey, countKey);
  });

  afterEach(async () => {
    await redis.del(queueKey, countKey);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Helper: add N sessions to the sorted set using increasing timestamps
  // so FIFO order is deterministic
  // ──────────────────────────────────────────────────────────────────────────
  async function seedQueue(sessions: string[]) {
    const pipeline = redis.pipeline();
    sessions.forEach((s, i) => {
      pipeline.zadd(queueKey, i + 1, s); // score = 1,2,3,… → FIFO
    });
    await pipeline.exec();
  }

  // ─── Test 1 ────────────────────────────────────────────────────────────────
  it('should admit candidates up to capacity', async () => {
    // 5 people in queue, capacity=5, slots=10 → all 5 should be admitted
    await seedQueue(['s1', 's2', 's3', 's4', 's5']);

    const admitted = await runAdmit(redis, luaScript, queueKey, countKey, 10, 5);

    // All 5 admitted
    expect(admitted).toHaveLength(5);
    expect(admitted.sort()).toEqual(['s1', 's2', 's3', 's4', 's5'].sort());

    // Queue is now empty
    const remaining = await redis.zcard(queueKey);
    expect(remaining).toBe(0);

    // admitted_count key should be 5
    const count = parseInt((await redis.get(countKey)) ?? '0', 10);
    expect(count).toBe(5);
  });

  // ─── Test 2 ────────────────────────────────────────────────────────────────
  it('should not admit if at capacity', async () => {
    // Set admitted_count to capacity already
    await redis.set(countKey, '10');
    await seedQueue(['s1', 's2']);

    const admitted = await runAdmit(redis, luaScript, queueKey, countKey, 5, 10);

    // Capacity exhausted → nothing admitted
    expect(admitted).toHaveLength(0);

    // Queue untouched — both sessions still in it
    const remaining = await redis.zcard(queueKey);
    expect(remaining).toBe(2);

    // admitted_count unchanged
    const count = parseInt((await redis.get(countKey)) ?? '0', 10);
    expect(count).toBe(10);
  });

  // ─── Test 3 ────────────────────────────────────────────────────────────────
  it('should admit partial if close to capacity', async () => {
    // 5 in queue, capacity=8, already admitted 6 → remaining_capacity = 2
    await redis.set(countKey, '6');
    await seedQueue(['s1', 's2', 's3', 's4', 's5']);

    // slots=10, but remaining_capacity limits to 2
    const admitted = await runAdmit(redis, luaScript, queueKey, countKey, 10, 8);

    // Only 2 should be admitted (FIFO → s1 and s2)
    expect(admitted).toHaveLength(2);
    expect(admitted).toContain('s1');
    expect(admitted).toContain('s2');
    expect(admitted).not.toContain('s3');

    // 3 remain in queue
    const remaining = await redis.zcard(queueKey);
    expect(remaining).toBe(3);

    // admitted_count = 6 + 2 = 8
    const count = parseInt((await redis.get(countKey)) ?? '0', 10);
    expect(count).toBe(8);
  });

  // ─── Test 4 ────────────────────────────────────────────────────────────────
  it('should do nothing if queue is empty', async () => {
    // Queue is empty — no ZADD, capacity is ample
    const admitted = await runAdmit(redis, luaScript, queueKey, countKey, 5, 100);

    expect(admitted).toHaveLength(0);

    // admitted_count key should not exist / still 0
    const count = parseInt((await redis.get(countKey)) ?? '0', 10);
    expect(count).toBe(0);
  });

  // ─── Test 5 ────────────────────────────────────────────────────────────────
  it('should correctly increment admitted count', async () => {
    // Run admit twice in sequence to verify INCRBY is cumulative
    await seedQueue(['s1', 's2', 's3', 's4', 's5', 's6']);

    // First tick: admit 2
    const firstBatch = await runAdmit(redis, luaScript, queueKey, countKey, 2, 100);
    expect(firstBatch).toHaveLength(2);

    // admitted_count should be 2
    const afterFirst = parseInt((await redis.get(countKey)) ?? '0', 10);
    expect(afterFirst).toBe(2);

    // Second tick: admit 3 more
    const secondBatch = await runAdmit(redis, luaScript, queueKey, countKey, 3, 100);
    expect(secondBatch).toHaveLength(3);

    // admitted_count should now be 5
    const afterSecond = parseInt((await redis.get(countKey)) ?? '0', 10);
    expect(afterSecond).toBe(5);

    // Admitted sessions should be disjoint (FIFO order preserved, ZREM works)
    const overlap = firstBatch.filter((s) => secondBatch.includes(s));
    expect(overlap).toHaveLength(0);

    // Queue should have 1 left (started with 6, admitted 5 total)
    const remaining = await redis.zcard(queueKey);
    expect(remaining).toBe(1);
  });
});
