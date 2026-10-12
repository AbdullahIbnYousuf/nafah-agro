// @vitest-environment node
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createCartRouter } from './carts.js';
import { requireAuthenticated } from '../middleware/supabaseAuth.js';
import type { CartService } from '../services/carts.js';

describe('authenticated cart routes', () => {
  function setup(role: 'OWNER' | 'CUSTOMER') {
    const read = vi.fn(async () => ({ revision: 0, items: [] }));
    const preview = vi.fn(async () => []);
    const service = { read, preview, mutate: vi.fn(), merge: vi.fn() } as unknown as CartService;
    const app = express(); app.use(express.json());
    const authenticate = requireAuthenticated(async () => ({ id: 'own-profile', email: 'test@example.com', claims: {} }), async () => ({ id: 'own-profile', role, fullName: 'Test', phoneNumber: null, isActive: true }));
    app.use('/api/v1', createCartRouter(service, authenticate, (_req, _res, next) => next()));
    return { app, read, preview };
  }
  it.each(['OWNER', 'CUSTOMER'] as const)('allows %s to access only the cart resolved from their identity', async role => {
    const { app, read } = setup(role);
    const response = await request(app).get('/api/v1/cart?profileId=another-account').set('Authorization', 'Bearer token');
    expect(response.status).toBe(200); expect(read).toHaveBeenCalledWith('own-profile');
  });
  it('requires authentication for persisted carts and permits read-only guest previews', async () => {
    const { app, read, preview } = setup('CUSTOMER');
    expect((await request(app).get('/api/v1/cart')).status).toBe(401); expect(read).not.toHaveBeenCalled();
    expect((await request(app).post('/api/v1/storefront/cart-preview').send({ items: [] })).status).toBe(200);
    expect(preview).toHaveBeenCalledWith([]);
  });
});
