// @vitest-environment node

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { pwaOptions } from '../vite.config.js';

function pngDimensions(buffer: Buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe('installable PWA configuration', () => {
  it('defines the required standalone manifest and branded icons', async () => {
    const manifest = pwaOptions.manifest;
    expect(manifest).toMatchObject({
      id: '/',
      name: 'নাফাহ এগ্রো',
      short_name: 'নাফাহ এগ্রো',
      lang: 'bn',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#004030',
      background_color: '#FFF9E5',
    });
    expect(manifest && 'icons' in manifest ? manifest.icons : []).toEqual(expect.arrayContaining([
      expect.objectContaining({ sizes: '192x192', type: 'image/png', purpose: 'any' }),
      expect.objectContaining({ sizes: '512x512', type: 'image/png', purpose: 'any' }),
      expect.objectContaining({ sizes: '192x192', type: 'image/png', purpose: 'maskable' }),
      expect.objectContaining({ sizes: '512x512', type: 'image/png', purpose: 'maskable' }),
    ]));

    for (const [file, size] of [
      ['public/pwa-192x192.png', 192],
      ['public/pwa-512x512.png', 512],
      ['public/pwa-192x192-maskable.png', 192],
      ['public/pwa-512x512-maskable.png', 512],
    ] as const) {
      expect(pngDimensions(await readFile(file))).toEqual({ width: size, height: size });
    }
  });

  it('precaches only local build assets and keeps every API request network-only', () => {
    expect(pwaOptions.registerType).toBe('prompt');
    expect(pwaOptions.devOptions?.enabled).toBe(true);
    expect(pwaOptions.workbox?.globPatterns).not.toContain('**/*.json');
    expect(pwaOptions.workbox?.navigateFallbackDenylist?.some(pattern => pattern.test('/api/v1/health'))).toBe(true);
    expect(pwaOptions.workbox?.importScripts).toContain('/push-handler.js');

    const runtimeRules = pwaOptions.workbox?.runtimeCaching ?? [];
    expect(runtimeRules).toHaveLength(1);
    const apiRule = runtimeRules[0];
    expect(apiRule.handler).toBe('NetworkOnly');
    expect(apiRule.urlPattern).toBeInstanceOf(RegExp);
    expect((apiRule.urlPattern as RegExp).test('https://nafah-agro.vercel.app/api/v1/products')).toBe(true);
    expect((apiRule.urlPattern as RegExp).test('https://project.supabase.co/auth/v1/user')).toBe(false);
    expect((apiRule.urlPattern as RegExp).test('https://res.cloudinary.com/demo/image/upload/item.jpg')).toBe(false);
  });

  it('keeps push payloads private and opens only approved application paths', async () => {
    const worker = await readFile('public/push-handler.js', 'utf8');
    expect(worker).toContain("self.addEventListener('push'");
    expect(worker).toContain("self.addEventListener('notificationclick'");
    expect(worker).toContain("received.url.startsWith('/')");
    expect(worker).not.toMatch(/customer(Name|Phone|Address)|phoneNumber|grandTotal/);
  });
});
