import { test, expect, type Page } from '@playwright/test';

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

test.describe.configure({ mode: 'serial' });

async function expectNoPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth, `page width ${dimensions.scrollWidth} should fit ${dimensions.clientWidth}`).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function expectComfortableTouchTargets(page: Page) {
  const undersized = await page.locator('a, button, input, select, textarea').evaluateAll((elements) =>
    elements.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (rect.width === 0 || rect.height === 0 || style.visibility === 'hidden' || style.display === 'none') return [];
      return rect.width < 40 || rect.height < 40
        ? [`${element.tagName.toLowerCase()}[${element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 30) ?? ''}] ${Math.round(rect.width)}x${Math.round(rect.height)}`]
        : [];
    }),
  );
  expect(undersized, `undersized controls: ${undersized.join(', ')}`).toEqual([]);
}

async function expectVisibleKeyboardFocus(page: Page) {
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (!element) return null;
    const style = getComputedStyle(element);
    return { tag: element.tagName, outline: style.outlineStyle, shadow: style.boxShadow };
  });
  expect(focus?.tag).not.toBe('BODY');
  expect(focus && (focus.outline !== 'none' || focus.shadow !== 'none')).toBeTruthy();
}

test('public storefront remains usable at mobile, tablet, and desktop widths', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const path of ['/', '/shop']) {
      await page.goto(path);
      await expect(page.locator('body')).toBeVisible();
      await expectNoPageOverflow(page);
      if (viewport.name === 'mobile') {
        await expectComfortableTouchTargets(page);
        await expectVisibleKeyboardFocus(page);
      }
    }
    const firstProduct = page.locator('a[href^="/products/"]').first();
    await expect(firstProduct).toBeVisible({ timeout: 20_000 });
    await firstProduct.click();
    await expect(page.getByRole('button', { name: /কার্টে যোগ করুন/ })).toBeVisible();
    await expectNoPageOverflow(page);
    if (viewport.name === 'mobile') {
      await expectComfortableTouchTargets(page);
      await expectVisibleKeyboardFocus(page);
    }
  }

  expect(consoleErrors).toEqual([]);
});

test('OWNER management panel remains usable at required widths', async ({ page }) => {
  const email = process.env.OWNER_EMAIL;
  const password = process.env.OWNER_PASSWORD;
  test.skip(!email || !password, 'Set OWNER_EMAIL and OWNER_PASSWORD for the authenticated responsive check.');

  const consoleErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto('/login');
  await page.getByLabel('ইমেইল').fill(email!);
  await page.getByLabel('পাসওয়ার্ড').fill(password!);
  await page.getByRole('button', { name: 'লগইন করুন' }).click();
  await expect(page).toHaveURL('/', { timeout: 30_000 });

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/admin');
    await expect(page.getByRole('link', { name: /নাফাহ এগ্রো পরিচালনা/ })).toBeVisible();
    await expectNoPageOverflow(page);

    for (const tab of ['পণ্য', 'ক্যাটাগরি', 'ক্রয় ও ইনভেন্টরি', 'ফিজিক্যাল বিক্রয়', 'অর্ডার']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await expect(page.locator('main')).toBeVisible();
      await expectNoPageOverflow(page);
      if (viewport.name === 'mobile') await expectComfortableTouchTargets(page);
    }
  }

  expect(consoleErrors).toEqual([]);
});
