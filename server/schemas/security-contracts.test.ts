// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  bulkPriceChangeSchema,
  categoryCreateSchema,
  priceChangeSchema,
  productCreateSchema,
  productKindChangeSchema,
  variantUpdateSchema,
} from './catalog.js';
import {
  creditPaymentVoidSchema,
  physicalSaleCreateSchema,
  physicalSaleReturnSchema,
  stockAdjustmentSchema,
} from './inventory.js';
import { manualDeliveryOrderSchema, orderLifecycleSchema, websiteCheckoutSchema } from './orders.js';

const variantId = '10000000-0000-4000-8000-000000000001';
const secondVariantId = '10000000-0000-4000-8000-000000000002';
const saleItemId = '40000000-0000-4000-8000-000000000001';
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

  it('uses truthful defaults when routine catalog reasons are omitted', () => {
    expect(productCreateSchema.parse({
      name: 'Rice', slug: 'rice', categoryId,
      initialVariant: { name: '1 kg', sellingPrice: '100' },
    }).priceReason).toBe('প্রাথমিক দাম');
    expect(productKindChangeSchema.parse({
      kind: 'LOOSE_WEIGHT', sellingPrice: '100', lowStockThreshold: 1,
    }).reason).toBe('পণ্যের ধরন পরিবর্তন');
    expect(priceChangeSchema.parse({ sellingPrice: '120' }).reason).toBe('দাম পরিবর্তন');
    expect(bulkPriceChangeSchema.parse({ updates: [
      { variantId, sellingPrice: '120' },
      { variantId: secondVariantId, sellingPrice: '220' },
    ] }).reason).toBe('একসাথে দাম পরিবর্তন');
  });

  it('requires a positive lower 15+ price for egg products', () => {
    const base = { name: 'Eggs', slug: 'eggs', categoryId, kind: 'EGG' as const };
    expect(productCreateSchema.safeParse({
      ...base,
      initialVariant: { name: '', sellingPrice: '12', bulkSellingPrice: '10' },
    }).success).toBe(true);
    expect(productCreateSchema.safeParse({
      ...base,
      initialVariant: { name: '', sellingPrice: '12' },
    }).success).toBe(false);
    expect(productCreateSchema.safeParse({
      ...base,
      initialVariant: { name: '', sellingPrice: '12', bulkSellingPrice: '12' },
    }).success).toBe(false);
    expect(productKindChangeSchema.safeParse({
      kind: 'EGG', sellingPrice: '12', bulkSellingPrice: '13', lowStockThreshold: 5,
    }).success).toBe(false);
  });

  it('uses truthful defaults when cancellation and return reasons are omitted', () => {
    expect(orderLifecycleSchema.parse({ action: 'CANCEL' }).reason).toBe('অর্ডার বাতিল');
    expect(orderLifecycleSchema.parse({ action: 'FAILED_DELIVERY' }).reason).toBe('ডেলিভারি ব্যর্থ');
    expect(orderLifecycleSchema.parse({ action: 'RETURN', condition: 'SELLABLE' }).reason).toBe('পণ্য রিটার্ন');
    expect(physicalSaleReturnSchema.parse({
      condition: 'DAMAGED',
      items: [{ salesOrderItemId: saleItemId, amount: '1', amountUnit: 'PIECE' }],
    }).reason).toBe('দোকানের বিক্রি রিটার্ন');
  });

  it('keeps safety-critical stock and payment-correction reasons required', () => {
    expect(stockAdjustmentSchema.safeParse({
      direction: 'DECREASE', productVariantId: variantId, amount: '1', amountUnit: 'PIECE',
    }).success).toBe(false);
    expect(creditPaymentVoidSchema.safeParse({}).success).toBe(false);
  });
});
