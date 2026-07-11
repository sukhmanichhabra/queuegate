import { test, expect } from '@playwright/test';
import { setupDb, createTestOpsAdmin, deleteUser, teardown } from './setup';

test.describe('Auth Flow', () => {
  let user: any;
  let credentials: { email: string; password: string };

  test.beforeAll(async () => {
    await setupDb();
    const admin = await createTestOpsAdmin();
    user = admin.user;
    credentials = { email: admin.email, password: admin.password };
  });

  test.afterAll(async () => {
    if (user) await deleteUser(user.id);
    await teardown();
  });

  test('Flow 4: Logout actually revokes the token', async ({ page }) => {
    // 1. Log in
    await page.goto('/login');
    
    page.on('response', response => {
      if (response.url().includes('/login')) {
        console.log('Auth Login Response:', response.status(), response.url());
      }
    });

    await page.fill('input[type="email"]', credentials.email);
    await page.fill('input[type="password"]', credentials.password);
    await page.click('button[type="submit"]');

    // Wait for redirect to complete to ensure token is saved
    await expect(page).toHaveURL(/\/events/, { timeout: 15000 });

    // 2. Capture the current access token from localStorage
    const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
    expect(accessToken).toBeTruthy();

    // 3. Click logout via the NavBar
    // The logout button usually has text "Log out" or similar, or an icon.
    // Let's find it. It might be in a dropdown or directly visible.
    const logoutBtn = page.locator('text=/sign out/i').first();
    await expect(logoutBtn).toBeVisible();
    await logoutBtn.click();

    // 4. Confirm redirect to /login
    await expect(page).toHaveURL(/\/login/);

    // 5. Replay the captured token directly against GET /admin/events via fetch()
    const replayStatus = await page.evaluate(async (token) => {
      const res = await fetch(`http://localhost:4000/admin/events`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      return res.status;
    }, accessToken);

    // Confirm 401 Unauthorized
    expect(replayStatus).toBe(401);
  });
});
