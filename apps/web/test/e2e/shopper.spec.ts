import { test, expect } from '@playwright/test';
import { setupDb, seedOnSaleEvent, deleteMerchant, teardown } from './setup';

test.describe('Shopper Flow', () => {
  let eventId: string;
  let event: any;

  test.beforeAll(async () => {
    await setupDb();
    event = await seedOnSaleEvent();
    eventId = event.id;
  });

  test.afterAll(async () => {
    if (event) {
      await deleteMerchant(event.merchant_id);
    }
    await teardown();
  });

  test('Flow 1: Join queue -> get admitted -> complete checkout', async ({ page }) => {
    test.setTimeout(90000);
    // Navigate to events page
    page.on('console', msg => console.log(`[Flow1 Console] ${msg.text()}`));
    await page.goto('/events');

    // Confirm at least one ON_SALE event is listed
    const eventCard = page.locator(`text=${event.title}`).locator('..').locator('..'); // go up to the card div
    await expect(page.locator(`text=${event.title}`)).toBeVisible({ timeout: 10000 });
    
    // Check queue depth is rendered
    await expect(eventCard.locator('text=/in queue/i')).toBeVisible();

    // Click through to event detail page
    await page.locator(`text=${event.title}`).first().click({ force: true });
    await expect(page).toHaveURL(new RegExp(`/events/${eventId}`), { timeout: 15000 });

    // Confirm countdown timer is visible
    const timer = page.locator('text=/Starts in/i');
    await expect(timer).toBeVisible();

    // Join queue
    const joinButton = page.getByRole('button', { name: /JOIN QUEUE/i });
    await expect(joinButton).toBeVisible();
    
    page.on('response', response => {
      if (response.url().includes('/join')) {
        console.log('Join Response:', response.status(), response.url());
      }
    });

    await joinButton.click();

    // 4. Wait in queue and get admitted
    // On waiting room, confirm we reached it (or skipped it)
    await expect(page).toHaveURL(/\/events\/.*\/waiting-room/, { timeout: 15000 });
    
    // The queue admits users quickly (rate=60/min), so the user might be admitted
    // immediately without seeing the "Your Position" label.
    // We just wait for the admission to complete.
    // The test specifies a generous timeout (60 seconds)
    // The page should transition to admitted state
    const checkoutButton = page.getByRole('button', { name: /Complete Purchase/i });
    await expect(checkoutButton).toBeVisible({ timeout: 60000 });
    
    // Seat map should not be visible
    await expect(page.locator('text=/Seat Map/i')).toHaveCount(0);

    // Complete checkout
    await checkoutButton.click();
    
    // Confirm receipt/success state renders with real entryId-based ticket reference
    await expect(page.locator('text=/TICKETS SECURED!/i')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=/TICKET REF:/i')).toBeVisible();
  });

  test('Concurrent Flow 1: Two shoppers join queue simultaneously', async ({ browser }) => {
    test.setTimeout(90000);
    
    // Seed a specific event that has rate=1 so the queue doesn't drain instantly.
    // This allows us to reliably check positions in the waiting room!
    const slowEvent = await seedOnSaleEvent(1);
    const slowEventId = slowEvent.id;
    
    // Use two browser contexts to simulate concurrent shoppers
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    
    // Navigate both to event page
    pageA.on('console', msg => console.log(`[FlowC1 Console A] ${msg.text()}`));
    pageB.on('console', msg => console.log(`[FlowC1 Console B] ${msg.text()}`));
    await Promise.all([
      pageA.goto(`/events/${slowEventId}`),
      pageB.goto(`/events/${slowEventId}`)
    ]);
    
    // Click join queue concurrently
    const joinA = pageA.getByRole('button', { name: /JOIN QUEUE/i });
    const joinB = pageB.getByRole('button', { name: /JOIN QUEUE/i });
    

    // Start waiting for the join API responses and navigation
    const [joinResponseA, joinResponseB] = await Promise.all([
      pageA.waitForResponse(res => res.url().includes('/join') && res.status() === 201, { timeout: 15000 }),
      pageB.waitForResponse(res => res.url().includes('/join') && res.status() === 201, { timeout: 15000 }),
      joinA.click(),
      joinB.click()
    ]);
    
    // Wait for waiting room
    await Promise.all([
      expect(pageA).toHaveURL(/\/events\/.*\/waiting-room/, { timeout: 15000 }),
      expect(pageB).toHaveURL(/\/events\/.*\/waiting-room/, { timeout: 15000 })
    ]);
    
    const posDataA = await joinResponseA.json();
    const posDataB = await joinResponseB.json();
    
    const posA = posDataA.position;
    const posB = posDataB.position;
    
    console.log(`Concurrent Positions -> A: ${posA}, B: ${posB}`);
    
    // Core assertion for Flow 1 Concurrent: positions must be DIFFERENT and valid
    expect(posA).toBeGreaterThan(0);
    expect(posB).toBeGreaterThan(0);
    expect(posA).not.toEqual(posB);
    
    console.log('Concurrent Positions -> Position ordering successfully verified!');
    
    // Cleanup the slow merchant to avoid polluting the DB for subsequent runs
    await deleteMerchant(slowEvent.merchant_id);
    await contextA.close();
    await contextB.close();
  });
});
