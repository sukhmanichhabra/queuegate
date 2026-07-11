import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

export const db = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:secret@localhost:5432/queuegate?schema=public"
});

export async function createTestMerchantAdmin() {
  const email = `merchant-admin-${Date.now()}@test.com`;
  const password = 'Test1234!';
  const passwordHash = await bcrypt.hash(password, 10);
  
  const id = crypto.randomUUID();
  await db.query(`INSERT INTO "User" (id, email, password_hash, created_at) VALUES ($1, $2, $3, NOW())`, [id, email, passwordHash]);
  
  // Create the merchant first so we can link it
  const merchantId = crypto.randomUUID();
  await db.query(`INSERT INTO "Merchant" (id, name, owner_user_id, created_at) VALUES ($1, $2, $3, NOW())`, [merchantId, `Test Merchant ${Date.now()}`, id]);
  
  await db.query(`INSERT INTO "UserRole" (id, user_id, role, merchant_id) VALUES ($1, $2, $3, $4)`, [crypto.randomUUID(), id, 'MERCHANT_ADMIN', merchantId]);
  
  return { user: { id, email }, email, password, merchantId };
}

export async function createTestOpsAdmin() {
  const email = `ops-admin-${Date.now()}@test.com`;
  const password = 'Test1234!';
  const passwordHash = await bcrypt.hash(password, 10);
  
  const id = crypto.randomUUID();
  await db.query(`INSERT INTO "User" (id, email, password_hash, created_at) VALUES ($1, $2, $3, NOW())`, [id, email, passwordHash]);
  await db.query(`INSERT INTO "UserRole" (id, user_id, role) VALUES ($1, $2, $3)`, [crypto.randomUUID(), id, 'OPS_ADMIN']);
  
  return { user: { id, email }, email, password };
}

export async function createMerchant(name: string, ownerUserId?: string) {
  const id = crypto.randomUUID();
  await db.query(`INSERT INTO "Merchant" (id, name, owner_user_id, created_at) VALUES ($1, $2, $3, NOW())`, [id, name, ownerUserId || null]);
  return { id, name };
}

export async function createEvent(merchantId: string, title: string) {
  const id = crypto.randomUUID();
  await db.query(`
    INSERT INTO "Event" (id, merchant_id, title, artist, venue, show_date, ticket_price, capacity, status, admission_rate_per_min, baseline_admission_rate, created_at) 
    VALUES ($1, $2, $3, 'Artist', 'Venue', NOW() + INTERVAL '1 day', 10, 100, 'ON_SALE', 60, 60, NOW())
  `, [id, merchantId, title]);
  return { id, title, merchant_id: merchantId };
}

export async function deleteMerchant(id: string) {
  await db.query(`DELETE FROM "Merchant" WHERE id = $1`, [id]);
}

export async function deleteUser(id: string) {
  await db.query(`DELETE FROM "User" WHERE id = $1`, [id]);
}


export async function seedOnSaleEvent(admissionRatePerMin: number = 60) {
  const admin = await createTestMerchantAdmin();
  
  // 1. Login to get token
  const loginRes = await fetch('http://localhost:4000/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: admin.email, password: admin.password })
  });
  
  if (!loginRes.ok) {
    throw new Error(`Failed to login test admin: ${loginRes.status}`);
  }
  
  const loginData = await loginRes.json();
  const token = loginData.accessToken;
  
  // 2. Create Event
  const createRes = await fetch('http://localhost:4000/merchants/events', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      title: `E2E Test Event ${Date.now()}`,
      artist: 'Artist',
      venue: 'Venue',
      showDate: new Date(Date.now() + 86400000).toISOString(),
      ticketPrice: 10,
      capacity: 100,
      admissionRatePerMin: admissionRatePerMin
    })
  });
  
  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to create event: ${createRes.status} ${errText}`);
  }
  
  const event = await createRes.json();
  
  // 3. Resume (set ON_SALE)
  const resumeRes = await fetch(`http://localhost:4000/merchants/events/${event.id}/resume`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!resumeRes.ok) {
    const errText = await resumeRes.text();
    throw new Error(`Failed to resume event: ${resumeRes.status} ${errText}`);
  }
  
  return event;
}

export async function setupDb() {
  // Pool connects automatically on query, no need to connect explicitly
}

export async function teardown() {
  // Pool can stay open until the worker process exits
}
