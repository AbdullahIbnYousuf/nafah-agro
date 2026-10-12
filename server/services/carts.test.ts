// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { cartLinesSchema, createCartService, mergeCartLines, requireCartRevision } from './carts.js';

const VARIANT = '10000000-0000-4000-8000-000000000001';
const PRODUCT = '20000000-0000-4000-8000-000000000001';
const CUSTOMER = '30000000-0000-4000-8000-000000000001';
const OWNER = '30000000-0000-4000-8000-000000000002';
const KEY = '40000000-0000-4000-8000-000000000001';
function memory() {
  const state: any = { carts: {}, receipts: [], variant: {
    id: VARIANT, productId: PRODUCT, name: 'Default', unitLabel: 'বস্তা', currentSellingPrice: new Prisma.Decimal(500),
    bulkSellingPrice: null, availableStock: 0, isActive: true,
    product: { name: 'Rice', kind: 'PACKAGED', images: ['rice.jpg'], isActive: true, isVisibleInShop: true, category: { isActive: true, isVisibleInShop: true } },
  } };
  let tail = Promise.resolve();
  const db: any = {
    productVariant: { findMany: async ({ where }: any) => state.variant && where.id.in.includes(state.variant.id) ? [state.variant] : [] },
    accountCart: {
      findUnique: async ({ where }: any) => state.carts[where.profileId] ?? null,
      findUniqueOrThrow: async ({ where }: any) => state.carts[where.profileId],
      update: async ({ where, data }: any) => { const cart = state.carts[where.profileId]; cart.items = data.items; cart.revision += data.revision.increment; return cart; },
    },
    cartMergeReceipt: {
      findUnique: async ({ where }: any) => state.receipts.find((receipt: any) => receipt.profileId === where.profileId_mergeKey.profileId && receipt.mergeKey === where.profileId_mergeKey.mergeKey) ?? null,
      create: async ({ data }: any) => { state.receipts.push(data); return data; },
    },
    $executeRaw: async (_query: any, profileId: string) => { state.carts[profileId] ??= { profileId, revision: 0, items: [] }; },
    $queryRaw: async () => [],
    $transaction: async (fn: any) => {
      const previous = tail; let release!: () => void;
      tail = new Promise<void>(resolve => { release = resolve; }); await previous;
      const snapshot = structuredClone({ carts: state.carts, receipts: state.receipts });
      try { return await fn(db); } catch (error) { Object.assign(state, snapshot); throw error; } finally { release(); }
    },
  };
  return { service: createCartService(db as PrismaClient), state };
}
describe('account draft carts', () => {
  it('keeps different accounts separate and permits pending zero-stock items without reserving', async () => {
    const { service, state } = memory();
    const cart = await service.mutate(CUSTOMER, 0, 'ADD', { productVariantId: VARIANT, quantity: 2 });
    expect(cart).toMatchObject({ revision: 1, items: [{ quantity: 2, unitLabel: 'বস্তা', available: true, lineTotal: 1000 }] });
    expect((await service.read(OWNER)).items).toEqual([]);
    expect(state.variant.availableStock).toBe(0);
  });
  it('rejects stale writes and duplicate retried adds', async () => {
    const { service } = memory();
    await service.mutate(CUSTOMER, 0, 'ADD', { productVariantId: VARIANT, quantity: 1 });
    await expect(service.mutate(CUSTOMER, 0, 'ADD', { productVariantId: VARIANT, quantity: 1 })).rejects.toMatchObject({ code: 'CART_CONFLICT' });
    expect((await service.read(CUSTOMER)).items[0].quantity).toBe(1);
  });
  it('lets only one simultaneous mutation of a revision succeed', async () => {
    const { service } = memory();
    const outcomes = await Promise.allSettled([1, 2].map(quantity => service.mutate(CUSTOMER, 0, 'ADD', { productVariantId: VARIANT, quantity })));
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((await service.read(CUSTOMER)).revision).toBe(1);
  });
  it('merges matching quantities exactly once and scopes receipts per account', async () => {
    const { service } = memory();
    await service.mutate(CUSTOMER, 0, 'ADD', { productVariantId: VARIANT, quantity: 2 });
    await service.merge(CUSTOMER, KEY, [{ productVariantId: VARIANT, quantity: 3 }]);
    await service.merge(CUSTOMER, KEY, [{ productVariantId: VARIANT, quantity: 3 }]);
    expect((await service.read(CUSTOMER)).items[0].quantity).toBe(5);
    expect((await service.read(CUSTOMER)).revision).toBe(2);
    expect((await service.merge(OWNER, KEY, [{ productVariantId: VARIANT, quantity: 3 }])).items[0].quantity).toBe(3);
  });
  it('retains unavailable/deleted lines and allows their removal', async () => {
    const { service, state } = memory();
    await service.mutate(CUSTOMER, 0, 'ADD', { productVariantId: VARIANT, quantity: 1 });
    state.variant = null;
    expect((await service.read(CUSTOMER)).items[0]).toMatchObject({ productName: 'Rice', available: false, lineTotal: 0 });
    expect((await service.mutate(CUSTOMER, 1, 'REMOVE', { productVariantId: VARIANT, quantity: 1 })).items).toEqual([]);
  });
  it('uses current prices, egg tiers, and parent gates', async () => {
    const { service, state } = memory();
    state.variant.product.kind = 'EGG'; state.variant.currentSellingPrice = new Prisma.Decimal(12); state.variant.bulkSellingPrice = new Prisma.Decimal(10);
    expect((await service.preview([{ productVariantId: VARIANT, quantity: 14 }]))[0].lineTotal).toBe(168);
    expect((await service.preview([{ productVariantId: VARIANT, quantity: 15 }]))[0].lineTotal).toBe(150);
    state.variant.product.category.isVisibleInShop = false;
    expect((await service.preview([{ productVariantId: VARIANT, quantity: 15 }]))[0].available).toBe(false);
    await expect(service.mutate(CUSTOMER, 0, 'ADD', { productVariantId: VARIANT, quantity: 15 })).rejects.toMatchObject({ code: 'CART_ITEM_UNAVAILABLE' });
  });
  it('rejects fractions, excessive merging, and duplicate lines', () => {
    expect(cartLinesSchema.safeParse([{ productVariantId: VARIANT, quantity: 0.5 }]).success).toBe(false);
    expect(cartLinesSchema.safeParse([{ productVariantId: VARIANT, quantity: 1 }, { productVariantId: VARIANT, quantity: 1 }]).success).toBe(false);
    expect(() => mergeCartLines([{ productVariantId: VARIANT, quantity: 1_000_000 }], [{ productVariantId: VARIANT, quantity: 1 }])).toThrow();
    expect(() => requireCartRevision(2, 1)).toThrow();
  });
});
