/**
 * StageDoor seed — with ticket categories (multi-tier pricing).
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:secret@localhost:5432/queuegate';

const pool = new Pool({ connectionString: DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const SEED_MERCHANT_ID   = '00000000-0000-0000-0000-000000000001';
const SEED_EVENT_ID      = '00000000-0000-0000-0000-000000000002';
const MERCHANT_USER_ID   = '00000000-0000-0000-0000-000000000010';
const SHOPPER_USER_ID    = '00000000-0000-0000-0000-000000000011';

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);

  // ── Users ───────────────────────────────────────────────────────────────────
  await prisma.user.upsert({
    where:  { id: MERCHANT_USER_ID },
    update: {},
    create: { id: MERCHANT_USER_ID, email: 'merchant@test.com', password_hash: passwordHash },
  });

  await prisma.user.upsert({
    where:  { id: SHOPPER_USER_ID },
    update: {},
    create: { id: SHOPPER_USER_ID, email: 'shopper@test.com', password_hash: passwordHash },
  });

  // ── Merchant ─────────────────────────────────────────────────────────────────
  const merchant = await prisma.merchant.upsert({
    where:  { id: SEED_MERCHANT_ID },
    update: {},
    create: { id: SEED_MERCHANT_ID, name: 'StageDoor Promotions', owner_user_id: MERCHANT_USER_ID },
  });

  // Merchant admin role
  const existingRole = await prisma.userRole.findFirst({
    where: { user_id: MERCHANT_USER_ID, role: 'MERCHANT_ADMIN', merchant_id: SEED_MERCHANT_ID },
  });
  if (!existingRole) {
    await prisma.userRole.create({
      data: { user_id: MERCHANT_USER_ID, role: 'MERCHANT_ADMIN', merchant_id: SEED_MERCHANT_ID },
    });
  }

  // Shopper role
  const existingShopperRole = await prisma.userRole.findFirst({
    where: { user_id: SHOPPER_USER_ID, role: 'SHOPPER' },
  });
  if (!existingShopperRole) {
    await prisma.userRole.create({ data: { user_id: SHOPPER_USER_ID, role: 'SHOPPER' } });
  }

  console.log(`Merchant upserted: ${merchant.id} — ${merchant.name}`);

  // ── Eras Tour event ───────────────────────────────────────────────────────────
  const event = await prisma.event.upsert({
    where:  { id: SEED_EVENT_ID },
    update: {
      title:                   'Eras Tour — Night 1',
      artist:                  'Taylor Swift',
      venue:                   'Wembley Stadium, London',
      show_date:               new Date('2025-07-12T19:30:00.000Z'),
      ticket_price:            85,
      image_url:               'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=1000&auto=format&fit=crop',
      capacity:                45000,
      admission_rate_per_min:  280,
      baseline_admission_rate: 280,
      status:                  'ON_SALE',
    },
    create: {
      id:                      SEED_EVENT_ID,
      merchant_id:             SEED_MERCHANT_ID,
      title:                   'Eras Tour — Night 1',
      artist:                  'Taylor Swift',
      venue:                   'Wembley Stadium, London',
      show_date:               new Date('2025-07-12T19:30:00.000Z'),
      ticket_price:            85,
      image_url:               'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=1000&auto=format&fit=crop',
      series_id:               'eras-tour-wembley-2025',
      capacity:                45000,
      admission_rate_per_min:  280,
      baseline_admission_rate: 280,
      status:                  'ON_SALE',
    },
  });

  // ── Seed ticket categories for the Eras Tour event ───────────────────────────
  // Delete existing categories to ensure clean seed
  await prisma.ticketCategory.deleteMany({ where: { event_id: SEED_EVENT_ID } });

  const categories = [
    { name: 'VIP Floor',        description: 'Front-of-stage golden circle — closest to the action', price: 350, capacity: 2000,  color: '#facc15', sort_order: 0 },
    { name: 'Pit',             description: 'Standing area, stage-side views',                       price: 185, capacity: 5000,  color: '#e11d48', sort_order: 1 },
    { name: 'Lower Tier',      description: 'Seated — lower bowl sections A–L',                      price: 145, capacity: 12000, color: '#8b5cf6', sort_order: 2 },
    { name: 'Upper Tier',      description: 'Seated — upper sections M–Z, great panoramic view',     price: 85,  capacity: 18000, color: '#06b6d4', sort_order: 3 },
    { name: 'Accessibility',   description: 'Accessible seating with companion tickets',              price: 65,  capacity: 500,   color: '#10b981', sort_order: 4 },
    { name: 'General Admission', description: 'Unreserved standing, general areas',                  price: 55,  capacity: 7500,  color: '#f97316', sort_order: 5 },
  ];

  for (const cat of categories) {
    await prisma.ticketCategory.create({
      data: { ...cat, event_id: SEED_EVENT_ID },
    });
  }

  console.log(`Event upserted: ${event.id} — ${event.title}`);
  console.log(`  Categories: ${categories.length} created`);
}

main()
  .catch((e) => { console.error('Seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
