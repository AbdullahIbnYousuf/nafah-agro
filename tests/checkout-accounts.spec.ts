import { test, expect, type Page } from '@playwright/test';
test.use({ serviceWorkers: 'block' });

// These browser checks mock every API/Auth request and never create real orders.
const profileId = '30000000-0000-4000-8000-000000000001';
const orderId = '40000000-0000-4000-8000-000000000001';
const rateId = '50000000-0000-4000-8000-000000000001';
const item = { productId: '20000000-0000-4000-8000-000000000001', productVariantId: '10000000-0000-4000-8000-000000000001', productName: 'Rice', variantName: 'Default', unitLabel: 'বস্তা', productKind: 'PACKAGED', quantity: 1, unitPrice: 505, available: true };
const order = { id: orderId, orderNumber: 'WEB-BROWSER-CHECK', status: 'PENDING', grandTotal: 585, subtotal: 505, discountTotal: 0, priceIncreaseTotal: 0, deliveryCharge: 80, placedAt: '2026-10-12T01:00:00Z', customerName: 'Browser Test', customerPhone: '01700000000', customerAddress: 'Bogura address', deliveryArea: 'Dhaka', items: [{ id: 'line', productName: 'Rice', variantName: 'Default', quantity: 1, quantityUnit: 'PIECE', unitLabel: 'বস্তা', unitSellingPrice: 505, netLineRevenue: 505 }] };
async function mockApp(page: Page, signedIn: boolean) {
  let cart = { revision: 1, items: [item] as typeof item[] };
  await page.route('**/*.supabase.co/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown;
    if (path.endsWith('/auth/me')) data = { id: profileId, name: 'Browser Test', phoneNumber: '01700000000', email: 'browser@example.com', role: 'OWNER', isActive: true, deliveryAddress: 'Saved address', preferredDeliveryRateId: rateId };
    else if (path.endsWith('/cart')) data = cart;
    else if (path.endsWith('/cart-preview')) data = [item];
    else if (path.endsWith('/delivery-rates')) data = [{ id: rateId, name: 'Dhaka', code: 'DHAKA', charge: 80, isActive: true }];
    else if (path.endsWith('/orders/website')) { cart = { revision: 2, items: [] }; data = { order, replayed: false }; }
    else if (path.endsWith('/orders/my')) data = { data: [order], total: 1, page: 1, limit: 15, totalPages: 1 };
    else if (path.endsWith('/orders/my/' + orderId)) data = order;
    else data = [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });
  if (signedIn) {
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const accessToken = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: profileId, exp: expires, role: 'authenticated', aud: 'authenticated' })).toString('base64url'), 'test-signature'].join('.');
    await page.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
      key: 'nafah-agro-auth', session: { access_token: accessToken, refresh_token: 'test-refresh', expires_at: expires, expires_in: 3600, token_type: 'bearer', user: { id: profileId, email: 'browser@example.com', aud: 'authenticated', app_metadata: {}, user_metadata: {} } },
    });
  } else {
    await page.addInitScript(line => localStorage.setItem('nafah-agro-cart', JSON.stringify([line])), item);
  }
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}
test('guest mobile checkout has clear wording and a refresh-safe receipt', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await mockApp(page, false);
  await page.goto('/cart');
  await expect(page.getByText('লগইন ছাড়াও অর্ডার করতে পারবেন')).toBeVisible();
  await page.getByRole('button', { name: 'অর্ডার করতে এগিয়ে যান' }).click();
  await page.getByRole('radio').check();
  await page.getByLabel('নাম *', { exact: true }).fill('Browser Test');
  await page.getByLabel('ফোন *', { exact: true }).fill('01700000000');
  await page.getByLabel('সম্পূর্ণ ঠিকানা *').fill('Bogura address');
  await noOverflow(page);
  await page.getByRole('button', { name: 'অর্ডার প্লেস করুন' }).click();
  await expect(page).toHaveURL(/order-confirmation$/);
  await expect(page.getByRole('heading', { name: 'ধন্যবাদ! আপনার অর্ডার পেয়েছি।' })).toBeVisible();
  await page.reload(); await expect(page.getByText(/অর্ডার নম্বর: WEB-BROWSER-CHECK/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'অর্ডারের স্ট্যাটাস দেখুন' })).toHaveCount(0);
  await noOverflow(page);
});
test('owner personal orders and saved-address checkout work on desktop and mobile', async ({ page }) => {
  await mockApp(page, true);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto('/orders');
    await expect(page.getByRole('heading', { name: 'আমার অর্ডার', exact: true })).toBeVisible();
    await expect(page).toHaveTitle('আমার অর্ডার | নাফাহ এগ্রো');
    await page.getByRole('link', { name: /WEB-BROWSER-CHECK/ }).click();
    await expect(page.getByText('PENDING', { exact: true })).toBeVisible();
    await expect(page.getByText('Bogura address')).toBeVisible();
    await noOverflow(page);
  }
  await page.goto('/cart');
  await page.getByRole('button', { name: 'অর্ডার করতে এগিয়ে যান' }).click();
  await expect(page.getByLabel('সম্পূর্ণ ঠিকানা *')).toHaveValue('Saved address');
  await expect(page.getByText('লগইন ছাড়াও অর্ডার করতে পারবেন')).toHaveCount(0);
  await expect(page.getByLabel('এই ঠিকানা প্রোফাইলে সেভ করুন')).not.toBeChecked();
  await noOverflow(page);
});
