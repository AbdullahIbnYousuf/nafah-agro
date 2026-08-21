import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiErrorMessage, ApiError, getProducts } from './api';
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
