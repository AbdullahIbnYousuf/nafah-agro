// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { categoryCreateSchema, productCreateSchema, variantUpdateSchema } from './catalog.js';
import { physicalSaleCreateSchema } from './inventory.js';
import { manualDeliveryOrderSchema, websiteCheckoutSchema } from './orders.js';

const variantId = '10000000-0000-4000-8000-000000000001';
const categoryId = '20000000-0000-4000-8000-000000000001';
const deliveryRateId = '30000000-0000-4000-8000-000000000001';
const orderItems = [{ productVariantId: variantId, quantity: 1 }];
const physicalItems = [{ productVariantId: variantId, amount: '1', amountUnit: 'PIECE' }];
const customer = { name: 'Customer', phone: '01700000000', address: 'Dhaka address' };

describe('strict API input contracts', () => {
  it('rejects unknown role and buying-cost fields in catalog writes', () => {
    expect(categoryCreateSchema.safeParse({ name: 'Rice', slug: 'rice', role: 'OWNER' }).success).toBe(false);
    expect(productCreateSchema.safeParse({
      name: 'Rice', slug: 'rice', categoryId,
      initialVariant: { name: '1 kg', sellingPrice: '100', unitBuyingCost: '1' },
      priceReason: 'Initial price',
    }).success).toBe(false);
  });

  it('rejects client-supplied SKU values', () => {
    expect(productCreateSchema.safeParse({
      name: 'Rice', slug: 'rice', categoryId,
      initialVariant: { name: '1 kg', sku: 'RICE-1', sellingPrice: '100' },
      priceReason: 'Initial price',
    }).success).toBe(false);
    expect(variantUpdateSchema.safeParse({ sku: 'CHANGED-SKU' }).success).toBe(false);
  });

  it('rejects client-supplied totals, costs, discounts, and roles', () => {
    expect(physicalSaleCreateSchema.safeParse({ items: physicalItems, discountTotal: 0, totalBuyingCost: 1 }).success).toBe(false);
    expect(websiteCheckoutSchema.safeParse({ items: orderItems, customer, deliveryRateId, idempotencyKey: 'checkout-key-123456', discountTotal: 1 }).success).toBe(false);
    expect(manualDeliveryOrderSchema.safeParse({ source: 'PHONE', initialStatus: 'PENDING', items: orderItems, customer, deliveryRateId, discountTotal: 0, confirmUnprofitable: false, role: 'OWNER' }).success).toBe(false);
  });

  it('accepts measured sale amounts but rejects invalid precision', () => {
    expect(physicalSaleCreateSchema.safeParse({
      items: [{ productVariantId: variantId, amount: '1.25', amountUnit: 'KG' }],
    }).success).toBe(true);
    expect(physicalSaleCreateSchema.safeParse({
      items: [{ productVariantId: variantId, amount: '1.0001', amountUnit: 'KG' }],
    }).success).toBe(false);
  });
});
