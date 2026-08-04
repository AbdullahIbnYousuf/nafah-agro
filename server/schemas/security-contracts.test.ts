// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { categoryCreateSchema, productCreateSchema } from './catalog.js';
import { physicalSaleCreateSchema } from './inventory.js';
import { manualDeliveryOrderSchema, websiteCheckoutSchema } from './orders.js';

const variantId = '10000000-0000-4000-8000-000000000001';
const categoryId = '20000000-0000-4000-8000-000000000001';
const deliveryRateId = '30000000-0000-4000-8000-000000000001';
const items = [{ productVariantId: variantId, quantity: 1 }];
const customer = { name: 'Customer', phone: '01700000000', address: 'Dhaka address' };

describe('strict API input contracts', () => {
  it('rejects unknown role and buying-cost fields in catalog writes', () => {
    expect(categoryCreateSchema.safeParse({ name: 'Rice', slug: 'rice', role: 'OWNER' }).success).toBe(false);
    expect(productCreateSchema.safeParse({
      name: 'Rice', slug: 'rice', categoryId,
      initialVariant: { name: '1 kg', sku: 'RICE-1', sellingPrice: '100', unitBuyingCost: '1' },
      priceReason: 'Initial price',
    }).success).toBe(false);
  });

  it('rejects client-supplied totals, costs, discounts, and roles', () => {
    expect(physicalSaleCreateSchema.safeParse({ items, discountTotal: 0, totalBuyingCost: 1 }).success).toBe(false);
    expect(websiteCheckoutSchema.safeParse({ items, customer, deliveryRateId, idempotencyKey: 'checkout-key-123456', discountTotal: 1 }).success).toBe(false);
    expect(manualDeliveryOrderSchema.safeParse({ source: 'PHONE', initialStatus: 'PENDING', items, customer, deliveryRateId, discountTotal: 0, confirmUnprofitable: false, role: 'OWNER' }).success).toBe(false);
  });
});
