import { test, expect } from '@playwright/test';
import { setupDb, createTestOpsAdmin, createMerchant, createEvent, deleteMerchant, deleteUser, teardown } from './setup';

test.describe('Admin Flow', () => {
  let user: any;
  let credentials: { email: string; password: string };
  let event1: any;
  let event2: any;

  test.beforeAll(async () => {
    await setupDb();
    const admin = await createTestOpsAdmin();
    user = admin.user;
    credentials = { email: admin.email, password: admin.password };

    // Seed 2 merchants with 1 event each
    const m1 = await createMerchant(`Admin Test Merchant A ${Date.now()}`);
    const m2 = await createMerchant(`Admin Test Merchant B ${Date.now()}`);

    event1 = await createEvent(m1.id, `Admin Event 1 ${Date.now()}`);
    event1.merchant = m1;

    event2 = await createEvent(m2.id, `Admin Event 2 ${Date.now()}`);
    event2.merchant = m2;
  });

  test.afterAll(async () => {
    if (event1) await deleteMerchant(event1.merchant_id);
    if (event2) await deleteMerchant(event2.merchant_id);
    if (user) await deleteUser(user.id);
    await teardown();
  });

  test('Flow 3: Login -> view admin dashboard -> kafka health visible', async ({ page }) => {
    // 1. Log in as OPS_ADMIN
    page.on('response', response => {
      if (response.url().includes('/auth/login')) {
        console.log('Login Response:', response.status(), response.url());
      }
    });
    await page.goto('/login');
    
    await page.fill('input[type="email"]', credentials.email);
    await page.fill('input[type="password"]', credentials.password);
    await page.click('button[type="submit"]');

    // 2. Confirm redirect to /events
    await expect(page).toHaveURL(/\/events/);
    await page.goto('/admin/dashboard');

    // 3. Confirm /admin/kafka-health panel is visible
    // The panel has "KAFKA CONSUMER HEALTH" and a CONNECTED/DISCONNECTED badge.
    const kafkaHeader = page.locator('text=/KAFKA CONSUMER HEALTH/i');
    await expect(kafkaHeader).toBeVisible({ timeout: 10000 });
    
    // Check that it shows either CONNECTED or DISCONNECTED
    const connectedBadge = page.locator('text=CONNECTED').first();
    const disconnectedBadge = page.locator('text=DISCONNECTED').first();
    
    await Promise.any([
      expect(connectedBadge).toBeVisible(),
      expect(disconnectedBadge).toBeVisible()
    ]);

    // 4. Confirm cross-merchant events list shows events from 2+ merchants
    // We should see both merchant names in the ALL EVENTS list
    const m1Locator = page.locator(`text=${event1.merchant?.name || 'Admin Test Merchant A'}`);
    const m2Locator = page.locator(`text=${event2.merchant?.name || 'Admin Test Merchant B'}`);

    await expect(page.locator(`text=${event1.title}`)).toBeVisible();
    await expect(page.locator(`text=${event2.title}`)).toBeVisible();
  });
});
