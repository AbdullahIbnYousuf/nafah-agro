import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiErrorMessage, ApiError, getProducts, previewCart, createWebsiteOrder, getAccountCart } from './api';
import { supabase } from './supabase';

describe('API error presentation', () => {
  it('turns Zod issue details into a useful field-level message', () => {
    expect(apiErrorMessage({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: { issues: [{ path: ['customer', 'phone'], message: 'Phone is required' }] },
      },
    }, 400)).toBe('customer.phone: Phone is required');
  });

  it('falls back to the safe API message', () => {
    expect(apiErrorMessage({ error: { message: 'Insufficient stock' } }, 409)).toBe('Insufficient stock');
  });
});

describe('API request reliability', () => {
  it('uses explicit account tokens for carts but does not restore a session for guest quotes or checkout', async () => {
    const getSession = vi.spyOn(supabase.auth, 'getSession');
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: [] }) });
    vi.stubGlobal('fetch', fetch);
    await previewCart([]);
    await createWebsiteOrder({ items: [], customer: { name: 'Guest', phone: '01700000000', address: 'Bogura' }, deliveryRateId: 'rate', idempotencyKey: 'guest-key' });
    await getAccountCart('captured-account-token');
    expect(getSession).not.toHaveBeenCalled();
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
    expect(fetch.mock.calls[1][1].headers).not.toHaveProperty('Authorization');
    expect(fetch.mock.calls[2][1].headers.Authorization).toBe('Bearer captured-account-token');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not resolve a Supabase session for public catalog requests', async () => {
    const getSession = vi.spyOn(supabase.auth, 'getSession');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true, data: { data: [], total: 0, page: 1, limit: 12, totalPages: 0 } }),
    }));

    await getProducts({ limit: 12 });
    expect(getSession).not.toHaveBeenCalled();
  });

  it('reports a timed-out request distinctly', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));

    const pending = getProducts();
    const rejection = expect(pending).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT', status: 408 });
    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;
  });

  it('reports caller cancellation without presenting it as a network failure', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));

    const pending = getProducts(undefined, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' });
  });
});
