import { test, expect } from '@playwright/test';
test.use({ serviceWorkers: 'block' });

const metric = (value: number) => ({ value, previousValue: value, absoluteChange: 0, percentChange: 0 });
const data = {
  range: { preset: 'month', current: { from: '2026-10-01', to: '2026-10-12' }, previous: { from: '2026-09-01', to: '2026-09-12' } },
  summary: {
    productRevenue: metric(1000), grossProfit: metric(250), recognizedSales: metric(1080),
    cashProductRevenue: metric(700), creditProductRevenue: metric(300), grossMargin: metric(25),
    recognizedOrderCount: metric(8), deliveryCharges: metric(80), pendingCodOrderCount: 2,
    lowStockVariantCount: 1, outOfStockVariantCount: 0,
  },
  expenseSummary: { total: { value: 50, previousValue: 40, absoluteChange: 10, percentChange: 25 }, profitAfterExpenses: metric(200), stockLoss: metric(10) },
  trendGranularity: 'DAY', trend: [
    { current: { from: '2026-10-01', to: '2026-10-01', recognizedSales: 500, grossProfit: 100 }, previous: { from: '2026-09-01', to: '2026-09-01', recognizedSales: 400, grossProfit: 90 } },
    { current: { from: '2026-10-12', to: '2026-10-12', recognizedSales: 580, grossProfit: 150 }, previous: { from: '2026-09-12', to: '2026-09-12', recognizedSales: 500, grossProfit: 110 } },
  ],
  salesBySource: [{ source: 'WEBSITE', recognizedSales: 1080, orderCount: 8 }],
  pendingCod: { pending: 2, confirmed: 0, processing: 0 }, bestSelling: [], mostProfitable: [],
  paymentChannels: ['CASH', 'BKASH', 'NAGAD', 'ROCKET', 'BANK'].map(method => ({ method, received: 100, refunded: 10, net: 90 })),
};

test('dashboard prioritizes four cards and remains usable on desktop and mobile', async ({ page }) => {
  const id = '30000000-0000-4000-8000-000000000001';
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: id, exp: expires, role: 'authenticated', aud: 'authenticated' })).toString('base64url'), 'test-signature'].join('.');
  await page.addInitScript(session => localStorage.setItem('nafah-agro-auth', JSON.stringify(session)), {
    access_token: token, refresh_token: 'test-refresh', expires_at: expires, expires_in: 3600, token_type: 'bearer',
    user: { id, email: 'test@example.com', aud: 'authenticated', app_metadata: {}, user_metadata: {} },
  });
  await page.route('**/*.supabase.co/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    const result = path.endsWith('/auth/me') ? { id, name: 'Test Owner', email: 'test@example.com', role: 'OWNER', isActive: true }
      : path.endsWith('/analytics/dashboard') ? data
      : path.endsWith('/credit-customers/summary') ? { totalOutstanding: 100, overdueCount: 0, dueTodayCount: 0 }
      : { revision: 0, items: [] };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: result }) });
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/admin/dashboard');
    const main = page.getByRole('region', { name: 'সিলেক্ট করা সময়ের মূল হিসাব' });
    await expect(main.getByRole('heading', { name: 'এই মাসের হিসাব' })).toBeVisible();
    await expect(main.getByText('01/10/2026 থেকে 12/10/2026')).toBeVisible();
    const cards = main.locator('.grid').locator(':scope > *');
    await expect(cards).toHaveCount(4);
    const labels = ['পণ্য আয়', 'পণ্যের লাভ', 'দোকানের খরচ', 'খরচ বাদে লাভ'];
    const values = ['৳1,000', '৳250', '৳50', '৳200'];
    for (let index = 0; index < 4; index++) { await expect(cards.nth(index).getByText(labels[index], { exact: true })).toBeVisible(); await expect(cards.nth(index).getByText(values[index], { exact: true })).toBeVisible(); }
    const positions = await cards.evaluateAll(elements => elements.map(element => ({ x: element.getBoundingClientRect().x, y: element.getBoundingClientRect().y })));
    if (width === 1440) expect(new Set(positions.map(position => position.y)).size).toBe(1);
    else { expect(positions[0].y).toBe(positions[1].y); expect(positions[2].y).toBe(positions[3].y); expect(positions[2].y).toBeGreaterThan(positions[0].y); }
    await expect(page.getByRole('region', { name: 'আরও হিসাব' }).locator('.grid > *')).toHaveCount(5);
    const details = cards.nth(3).locator('details');
    await expect(details).not.toHaveAttribute('open');
    await details.locator('summary').focus(); await page.keyboard.press('Enter');
    await expect(details).toHaveAttribute('open');
    await expect(details.getByText(/পণ্যের লাভে আগেই ধরা আছে/)).toBeVisible();
    await expect(page.getByLabel('তারিখ থেকে')).toBeVisible();
    await expect(page.getByLabel('তারিখ পর্যন্ত')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `/tmp/nafah-dashboard-${width}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});
