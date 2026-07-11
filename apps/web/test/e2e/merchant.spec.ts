import { test, expect } from '@playwright/test';
import { setupDb, createTestMerchantAdmin, deleteUser, teardown, createMerchant, createEvent, deleteMerchant } from './setup';

test.describe('Merchant Admin Flow', () => {
  let user: any;
  let credentials: { email: string; password: string };
  let event: any;
  let merchant: any;

  test.beforeAll(async () => {
    await setupDb();
    const admin = await createTestMerchantAdmin();
    user = admin.user;
    credentials = { email: admin.email, password: admin.password };

    // 1. Create a VIP Event for the merchant
    event = await createEvent(admin.merchantId, `VIP Event ${Date.now()}`);
    event.merchant = { id: admin.merchantId };
    merchant = event.merchant;
  });

  test.afterAll(async () => {
    if (merchant) await deleteMerchant(merchant.id);
    if (user) await deleteUser(user.id);
    await teardown();
  });

  test('Flow 2: Login -> view dashboard -> add VIP entry', async ({ page }) => {
    // 1. Navigate to login
    await page.goto('/login');
    
    await page.fill('input[type="email"]', credentials.email);
    await page.fill('input[type="password"]', credentials.password);
    await page.click('button[type="submit"]');

    // 2. Confirm redirect to /events
    await expect(page).toHaveURL(/\/events/);
    await page.goto('/merchant/dashboard');

    // 3. Confirm dashboard shows merchant's own events
    await expect(page.locator(`text=${event.title}`)).toBeVisible();

    // 4. Navigate to live event's live dashboard
    // The live dashboard button usually links to /merchant/events/[id]/live
    // We can go directly or click it
    await page.goto(`/merchant/events/${event.id}/live`);
    await expect(page).toHaveURL(`/merchant/events/${event.id}/live`);

    // 5. Add a VIP email via the VIP whitelist panel
    const vipEmail = 'vip@artist.com';
    await page.fill('input[placeholder="vip@artist.com"]', vipEmail);
    // Click the plus button (title "Add email (or press Enter / comma)")
    await page.click('button[title="Add email (or press Enter / comma)"]');
    
    // Now click the submit button
    const addVipsBtn = page.locator('button', { hasText: 'Add ' });
    await expect(addVipsBtn).toBeEnabled();
    await addVipsBtn.click();

    // Confirm success state shows the correct count
    await expect(page.locator('text=1 VIP added').first()).toBeVisible({ timeout: 5000 });

    // 6. Click "Export Rate Log" - confirm a download is triggered
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Export Rate Log")');
    const download = await downloadPromise;
    
    // Check it's a CSV
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });
});
