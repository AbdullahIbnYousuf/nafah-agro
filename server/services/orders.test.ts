// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import { manualDeliveryOrderSchema, websiteCheckoutSchema } from "../schemas/orders.js";
import { createUnifiedOrderService } from "./orders.js";

const OWNER = "4cd56ef4-56d8-4a22-92fe-887e6f601de6";
const CUSTOMER = "4cd56ef4-56d8-4a22-92fe-887e6f601de7";
const VARIANT = "10000000-0000-4000-8000-000000000001";
const PRODUCT = "20000000-0000-4000-8000-000000000001";
const RATE = "30000000-0000-4000-8000-000000000001";
const money = (value: unknown) => new Prisma.Decimal(value as Prisma.Decimal.Value).toFixed(2);

function createMemoryPrisma() {
  let sequence = 10;
  const id = () => `00000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`;
  const state: any = {
    variants: [{
      id: VARIANT, productId: PRODUCT, name: "500 g", sku: "HONEY-500",
      currentSellingPrice: "500.00", availableStock: 5, reservedStock: 0, isActive: true,
      product: { id: PRODUCT, name: "Raw Honey", isActive: true },
    }],
    rates: [{ id: RATE, code: "DHAKA", name: "Dhaka", charge: "80.00", isActive: true, updatedByProfileId: null, createdAt: new Date(), updatedAt: new Date() }],
    batches: [
      { id: "40000000-0000-4000-8000-000000000001", productVariantId: VARIANT, source: "PURCHASE", purchasedQuantity: 2, availableQuantity: 2, reservedQuantity: 0, unitBuyingCost: "200.00", purchaseDate: new Date("2026-01-01"), createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01") },
      { id: "40000000-0000-4000-8000-000000000002", productVariantId: VARIANT, source: "PURCHASE", purchasedQuantity: 3, availableQuantity: 3, reservedQuantity: 0, unitBuyingCost: "250.00", purchaseDate: new Date("2026-02-01"), createdAt: new Date("2026-02-01"), updatedAt: new Date("2026-02-01") },
    ],
    orders: [], items: [], allocations: [], audits: [],
  };
  const creator = { fullName: "Owner", role: "OWNER" };

  function hydrateOrder(row: any) {
    const rate = state.rates.find((value: any) => value.id === row.deliveryRateId);
    return {
      ...row,
      subtotal: new Prisma.Decimal(row.subtotal), discountTotal: new Prisma.Decimal(row.discountTotal),
      deliveryCharge: new Prisma.Decimal(row.deliveryCharge), grandTotal: new Prisma.Decimal(row.grandTotal),
      totalBuyingCost: row.totalBuyingCost === null ? null : new Prisma.Decimal(row.totalBuyingCost),
      grossProfit: row.grossProfit === null ? null : new Prisma.Decimal(row.grossProfit),
      grossProfitMargin: row.grossProfitMargin === null ? null : new Prisma.Decimal(row.grossProfitMargin),
      createdBy: row.createdByProfileId ? creator : null,
      customerProfile: row.customerProfileId ? { id: row.customerProfileId, fullName: "Customer" } : null,
      deliveryRate: rate ? { ...rate, charge: rate.charge === null ? null : new Prisma.Decimal(rate.charge) } : null,
      items: state.items.filter((item: any) => item.salesOrderId === row.id).map((item: any) => ({
        ...item,
        unitSellingPrice: new Prisma.Decimal(item.unitSellingPrice), grossLineRevenue: new Prisma.Decimal(item.grossLineRevenue),
        allocatedDiscount: new Prisma.Decimal(item.allocatedDiscount), netLineRevenue: new Prisma.Decimal(item.netLineRevenue),
        totalBuyingCost: item.totalBuyingCost === null ? null : new Prisma.Decimal(item.totalBuyingCost),
        grossProfit: item.grossProfit === null ? null : new Prisma.Decimal(item.grossProfit),
        allocations: state.allocations.filter((allocation: any) => allocation.salesOrderItemId === item.id).map((allocation: any) => ({
          ...allocation, unitBuyingCost: new Prisma.Decimal(allocation.unitBuyingCost), totalBuyingCost: new Prisma.Decimal(allocation.totalBuyingCost),
          stockBatch: { purchaseDate: state.batches.find((batch: any) => batch.id === allocation.stockBatchId).purchaseDate },
        })),
      })),
    };
  }

  const applyNumber = (row: any, field: string, operation: any) => {
    if (operation?.increment !== undefined) row[field] += operation.increment;
    else if (operation?.decrement !== undefined) row[field] -= operation.decrement;
    else row[field] = operation;
  };
  let transactionTail = Promise.resolve();
  const api: any = {
    deliveryRate: {
      findMany: async () => state.rates.map((rate: any) => ({ ...rate, charge: rate.charge === null ? null : new Prisma.Decimal(rate.charge) })),
      findFirst: async ({ where }: any) => {
        const rate = state.rates.find((value: any) => value.id === where.id && (!where.isActive || value.isActive));
        return rate ? { ...rate, charge: rate.charge === null ? null : new Prisma.Decimal(rate.charge) } : null;
      },
      update: async ({ where, data }: any) => {
        const rate = state.rates.find((value: any) => value.id === where.id);
        Object.assign(rate, data, { charge: data.charge === undefined ? rate.charge : data.charge === null ? null : money(data.charge), updatedAt: new Date() });
        return { ...rate, charge: rate.charge === null ? null : new Prisma.Decimal(rate.charge) };
      },
    },
    productVariant: {
      findMany: async ({ where }: any) => state.variants.filter((variant: any) => where.id.in.includes(variant.id) && (!where.isActive || variant.isActive)).map((variant: any) => ({ ...variant, currentSellingPrice: new Prisma.Decimal(variant.currentSellingPrice) })),
      updateMany: async ({ where, data }: any) => {
        const variant = state.variants.find((value: any) => value.id === where.id);
        if (!variant || (where.availableStock?.gte !== undefined && variant.availableStock < where.availableStock.gte) || (where.reservedStock?.gte !== undefined && variant.reservedStock < where.reservedStock.gte)) return { count: 0 };
        if (data.availableStock !== undefined) applyNumber(variant, "availableStock", data.availableStock);
        if (data.reservedStock !== undefined) applyNumber(variant, "reservedStock", data.reservedStock);
        return { count: 1 };
      },
      update: async ({ where, data }: any) => {
        const variant = state.variants.find((value: any) => value.id === where.id);
        if (data.availableStock !== undefined) applyNumber(variant, "availableStock", data.availableStock);
        return variant;
      },
    },
    salesOrder: {
      create: async ({ data }: any) => {
        const now = new Date();
        const row = {
          id: id(), orderNumber: data.orderNumber, idempotencyKey: data.idempotencyKey ?? null,
          requestFingerprint: data.requestFingerprint ?? null, source: data.source, status: data.status,
          paymentMethod: data.paymentMethod, paymentStatus: data.paymentStatus,
          customerProfileId: data.customerProfileId ?? null, customerName: data.customerName ?? null,
          customerPhone: data.customerPhone ?? null, customerEmail: data.customerEmail ?? null,
          customerAddress: data.customerAddress ?? null, deliveryRateId: data.deliveryRateId ?? null,
          deliveryCharge: money(data.deliveryCharge ?? 0), subtotal: money(data.subtotal), discountTotal: money(data.discountTotal ?? 0),
          grandTotal: money(data.grandTotal), totalBuyingCost: data.totalBuyingCost === null ? null : money(data.totalBuyingCost ?? 0),
          grossProfit: data.grossProfit === null ? null : money(data.grossProfit ?? 0), grossProfitMargin: data.grossProfitMargin == null ? null : money(data.grossProfitMargin),
          unprofitableOverrideConfirmed: Boolean(data.unprofitableOverrideConfirmed), unprofitableOverrideByProfileId: data.unprofitableOverrideByProfileId ?? null,
          createdByProfileId: data.createdByProfileId ?? null, placedAt: data.placedAt ?? now, confirmedAt: null,
          completedAt: data.completedAt ?? null, deliveredAt: null, cancelledAt: null, returnedAt: null,
          statusReason: null, returnCondition: null, createdAt: now, updatedAt: now,
        };
        state.orders.push(row); return row;
      },
      findUnique: async ({ where }: any) => {
        const row = state.orders.find((order: any) => where.id ? order.id === where.id : order.idempotencyKey === where.idempotencyKey);
        return row ? hydrateOrder(row) : null;
      },
      update: async ({ where, data }: any) => {
        const row = state.orders.find((order: any) => order.id === where.id);
        Object.assign(row, data, {
          totalBuyingCost: data.totalBuyingCost === undefined ? row.totalBuyingCost : data.totalBuyingCost === null ? null : money(data.totalBuyingCost),
          grossProfit: data.grossProfit === undefined ? row.grossProfit : data.grossProfit === null ? null : money(data.grossProfit),
          grossProfitMargin: data.grossProfitMargin === undefined ? row.grossProfitMargin : data.grossProfitMargin === null ? null : money(data.grossProfitMargin),
          updatedAt: new Date(),
        });
        return row;
      },
      findMany: async ({ where = {}, skip = 0, take = 100 }: any) => state.orders.filter((order: any) => {
        if (where.source && order.source !== where.source) return false;
        if (where.status && order.status !== where.status) return false;
        if (where.customerProfileId && order.customerProfileId !== where.customerProfileId) return false;
        if (where.orderNumber?.contains && !order.orderNumber.toLowerCase().includes(where.orderNumber.contains.toLowerCase())) return false;
        if (where.customerPhone?.contains && !order.customerPhone?.includes(where.customerPhone.contains)) return false;
        return true;
      }).slice(skip, skip + take).map(hydrateOrder),
      count: async ({ where = {} }: any) => state.orders.filter((order: any) => (!where.source || order.source === where.source) && (!where.status || order.status === where.status)).length,
    },
    salesOrderItem: {
      create: async ({ data }: any) => {
        const row = { id: id(), ...data, unitSellingPrice: money(data.unitSellingPrice), grossLineRevenue: money(data.grossLineRevenue), allocatedDiscount: money(data.allocatedDiscount), netLineRevenue: money(data.netLineRevenue), totalBuyingCost: data.totalBuyingCost === null ? null : money(data.totalBuyingCost), grossProfit: data.grossProfit === null ? null : money(data.grossProfit), createdAt: new Date() };
        state.items.push(row); return row;
      },
      update: async ({ where, data }: any) => {
        const row = state.items.find((item: any) => item.id === where.id);
        Object.assign(row, data, { totalBuyingCost: data.totalBuyingCost === null ? null : money(data.totalBuyingCost), grossProfit: data.grossProfit === null ? null : money(data.grossProfit) });
        return row;
      },
    },
    orderAllocation: {
      create: async ({ data }: any) => {
        const row = { id: id(), ...data, unitBuyingCost: money(data.unitBuyingCost), totalBuyingCost: money(data.totalBuyingCost), consumedAt: null, releasedAt: null, createdAt: new Date(), updatedAt: new Date() };
        state.allocations.push(row); return row;
      },
      update: async ({ where, data }: any) => { const row = state.allocations.find((value: any) => value.id === where.id); Object.assign(row, data); return row; },
    },
    stockBatch: {
      updateMany: async ({ where, data }: any) => {
        const row = state.batches.find((batch: any) => batch.id === where.id);
        if (!row || (where.availableQuantity?.gte !== undefined && row.availableQuantity < where.availableQuantity.gte) || (where.reservedQuantity?.gte !== undefined && row.reservedQuantity < where.reservedQuantity.gte)) return { count: 0 };
        if (data.availableQuantity !== undefined) applyNumber(row, "availableQuantity", data.availableQuantity);
        if (data.reservedQuantity !== undefined) applyNumber(row, "reservedQuantity", data.reservedQuantity);
        return { count: 1 };
      },
      create: async ({ data }: any) => { const row = { id: id(), ...data, reservedQuantity: 0, unitBuyingCost: money(data.unitBuyingCost), createdAt: new Date(), updatedAt: new Date() }; state.batches.push(row); return row; },
    },
    auditLog: {
      create: async ({ data }: any) => { const row = { id: id(), ...data, createdAt: new Date() }; state.audits.push(row); return row; },
    },
    $queryRaw: async (query: any) => {
      const sql = (query.strings ?? []).join(" ");
      const value = String(query.values[0]);
      if (sql.includes("sales_orders")) return state.orders.some((order: any) => order.id === value) ? [{ id: value }] : [];
      return state.batches.filter((batch: any) => batch.productVariantId === value && batch.availableQuantity > 0)
        .sort((left: any, right: any) => left.purchaseDate.getTime() - right.purchaseDate.getTime() || left.id.localeCompare(right.id))
        .map((batch: any) => ({ id: batch.id, availableQuantity: batch.availableQuantity, unitBuyingCost: new Prisma.Decimal(batch.unitBuyingCost) }));
    },
    $transaction: async (operation: any) => {
      if (Array.isArray(operation)) return Promise.all(operation);
      let release!: () => void;
      const previous = transactionTail;
      transactionTail = new Promise<void>(resolve => { release = resolve; });
      await previous;
      const snapshot = structuredClone(state);
      try { return await operation(api); }
      catch (error) { Object.assign(state, snapshot); throw error; }
      finally { release(); }
    },
  };
  return { prisma: api as PrismaClient, state };
}

const websiteInput = (overrides: Record<string, unknown> = {}) => websiteCheckoutSchema.parse({
  items: [{ productVariantId: VARIANT, quantity: 3 }],
  customer: { name: "Guest", phone: "01700000000", address: "Dhaka address" },
  deliveryRateId: RATE, idempotencyKey: "checkout-key-001", ...overrides,
});
const manualInput = (overrides: Record<string, unknown> = {}) => manualDeliveryOrderSchema.parse({
  source: "PHONE", initialStatus: "CONFIRMED", items: [{ productVariantId: VARIANT, quantity: 3 }],
  customer: { name: "Manual", phone: "01800000000", address: "Dhaka address" },
  deliveryRateId: RATE, discountTotal: "0", ...overrides,
});

describe("unified PostgreSQL orders", () => {
  it("rejects client-submitted prices and totals at the checkout boundary", () => {
    expect(() => websiteCheckoutSchema.parse({
      ...websiteInput(), subtotal: "1.00", totalBuyingCost: "0.01", grandTotal: "1.00",
    })).toThrow();
  });

  it("creates guest COD as pending with server prices and no stock reservation", async () => {
    const { prisma, state } = createMemoryPrisma();
    const result = await createUnifiedOrderService(prisma).createWebsiteOrder(websiteInput());
    expect(result.order).toMatchObject({ source: "WEBSITE", status: "PENDING", paymentMethod: "CASH_ON_DELIVERY", subtotal: 1500, grandTotal: 1580 });
    expect(state.variants[0]).toMatchObject({ availableStock: 5, reservedStock: 0 });
    expect(state.allocations).toHaveLength(0);
  });

  it("replays identical idempotent checkout and rejects changed payload", async () => {
    const { prisma } = createMemoryPrisma(); const service = createUnifiedOrderService(prisma);
    const first = await service.createWebsiteOrder(websiteInput());
    const replay = await service.createWebsiteOrder(websiteInput());
    expect(replay.replayed).toBe(true); expect(replay.order.id).toBe(first.order.id);
    await expect(service.createWebsiteOrder(websiteInput({ items: [{ productVariantId: VARIANT, quantity: 2 }] }))).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("associates an authenticated website order and returns only that customer's website orders", async () => {
    const { prisma } = createMemoryPrisma(); const service = createUnifiedOrderService(prisma);
    await service.createWebsiteOrder(websiteInput(), CUSTOMER);
    expect(await service.listCustomerWebsiteOrders(CUSTOMER)).toHaveLength(1);
    expect(await service.listCustomerWebsiteOrders(OWNER)).toHaveLength(0);
  });

  it("reserves FIFO across batches only when confirmed", async () => {
    const { prisma, state } = createMemoryPrisma(); const service = createUnifiedOrderService(prisma);
    const pending = await service.createWebsiteOrder(websiteInput());
    const confirmed = await service.transitionOrder(pending.order.id, { action: "CONFIRM", confirmUnprofitable: false }, OWNER);
    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.items[0].allocations.map(value => value.quantity)).toEqual([2, 1]);
    expect(state.batches.map((batch: any) => [batch.availableQuantity, batch.reservedQuantity])).toEqual([[0, 2], [2, 1]]);
  });

  it("rejects insufficient stock and rolls the reservation back", async () => {
    const { prisma, state } = createMemoryPrisma(); const service = createUnifiedOrderService(prisma);
    const pending = await service.createWebsiteOrder(websiteInput({ items: [{ productVariantId: VARIANT, quantity: 6 }] }));
    await expect(service.transitionOrder(pending.order.id, { action: "CONFIRM", confirmUnprofitable: false }, OWNER)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(state.variants[0]).toMatchObject({ availableStock: 5, reservedStock: 0 });
    expect(state.allocations).toHaveLength(0);
  });

  it("protects final stock when two orders are confirmed concurrently", async () => {
    const { prisma, state } = createMemoryPrisma(); const service = createUnifiedOrderService(prisma);
    const one = await service.createWebsiteOrder(websiteInput({ idempotencyKey: "concurrent-001", items: [{ productVariantId: VARIANT, quantity: 3 }] }));
    const two = await service.createWebsiteOrder(websiteInput({ idempotencyKey: "concurrent-002", items: [{ productVariantId: VARIANT, quantity: 3 }] }));
    const results = await Promise.allSettled([service.transitionOrder(one.order.id, { action: "CONFIRM", confirmUnprofitable: false }, OWNER), service.transitionOrder(two.order.id, { action: "CONFIRM", confirmUnprofitable: false }, OWNER)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(state.variants[0].availableStock).toBe(2);
  });

  it("creates a confirmed manual order and applies its admin discount", async () => {
    const { prisma } = createMemoryPrisma();
    const order = await createUnifiedOrderService(prisma).createManualOrder(manualInput({ discountTotal: "100" }), OWNER);
    expect(order).toMatchObject({ source: "PHONE", status: "CONFIRMED", subtotal: 1500, discountTotal: 100, grandTotal: 1480 });
  });

  it("rejects discounts greater than subtotal", async () => {
    const { prisma } = createMemoryPrisma();
    await expect(createUnifiedOrderService(prisma).createManualOrder(manualInput({ discountTotal: "1600" }), OWNER)).rejects.toMatchObject({ code: "DISCOUNT_EXCEEDS_SUBTOTAL" });
  });

  it("cancels a pending order without changing stock", async () => {
    const { prisma, state } = createMemoryPrisma(); const service = createUnifiedOrderService(prisma);
    const pending = await service.createWebsiteOrder(websiteInput());
    const cancelled = await service.transitionOrder(pending.order.id, { action: "CANCEL", reason: "Customer asked" }, OWNER);
    expect(cancelled.status).toBe("CANCELLED"); expect(state.variants[0]).toMatchObject({ availableStock: 5, reservedStock: 0 });
  });

  it("releases all FIFO reservations when a confirmed order is cancelled", async () => {
    const { prisma, state } = createMemoryPrisma(); const service = createUnifiedOrderService(prisma);
    const order = await service.createManualOrder(manualInput(), OWNER);
    const cancelled = await service.transitionOrder(order.id, { action: "CANCEL", reason: "Customer asked" }, OWNER);
    expect(cancelled).toMatchObject({ status: "CANCELLED", totalBuyingCost: null, grossProfit: null });
    expect(state.variants[0]).toMatchObject({ availableStock: 5, reservedStock: 0 });
    expect(state.allocations.every((value: any) => value.state === "RELEASED")).toBe(true);
  });

  it("records failed delivery while releasing reserved stock", async () => {
    const { prisma, state } = createMemoryPrisma(); const service = createUnifiedOrderService(prisma);
    const order = await service.createManualOrder(manualInput(), OWNER);
    const failed = await service.transitionOrder(order.id, { action: "FAILED_DELIVERY", reason: "Customer unreachable" }, OWNER);
    expect(failed.statusReason).toContain("FAILED_DELIVERY"); expect(state.variants[0].availableStock).toBe(5);
  });

  it("delivery consumes reservations and recognizes captured profit snapshots", async () => {
    const { prisma, state } = createMemoryPrisma(); const service = createUnifiedOrderService(prisma);
    const order = await service.createManualOrder(manualInput(), OWNER);
    const delivered = await service.transitionOrder(order.id, { action: "DELIVER" }, OWNER);
    expect(delivered).toMatchObject({ status: "DELIVERED", paymentStatus: "PAID", totalBuyingCost: 650, grossProfit: 850 });
    expect(state.variants[0]).toMatchObject({ availableStock: 2, reservedStock: 0 });
    expect(state.allocations.every((value: any) => value.state === "CONSUMED")).toBe(true);
  });

  it("a sellable whole-order return restores stock at captured buying costs", async () => {
    const { prisma, state } = createMemoryPrisma(); const service = createUnifiedOrderService(prisma);
    const order = await service.createManualOrder(manualInput(), OWNER);
    await service.transitionOrder(order.id, { action: "DELIVER" }, OWNER);
    const returned = await service.transitionOrder(order.id, { action: "RETURN", condition: "SELLABLE", reason: "Customer return" }, OWNER);
    expect(returned).toMatchObject({ status: "RETURNED_SELLABLE", paymentStatus: "REFUNDED", returnCondition: "SELLABLE" });
    expect(state.variants[0].availableStock).toBe(5);
    expect(state.batches.filter((batch: any) => batch.source === "SELLABLE_RETURN")).toHaveLength(2);
  });

  it("a damaged whole-order return reverses status without restoring stock", async () => {
    const { prisma, state } = createMemoryPrisma(); const service = createUnifiedOrderService(prisma);
    const order = await service.createManualOrder(manualInput(), OWNER);
    await service.transitionOrder(order.id, { action: "DELIVER" }, OWNER);
    const returned = await service.transitionOrder(order.id, { action: "RETURN", condition: "DAMAGED", reason: "Broken package" }, OWNER);
    expect(returned.status).toBe("RETURNED_DAMAGED"); expect(state.variants[0].availableStock).toBe(2);
  });

  it("lists unified sources with source and status filters", async () => {
    const { prisma } = createMemoryPrisma(); const service = createUnifiedOrderService(prisma);
    await service.createWebsiteOrder(websiteInput()); await service.createManualOrder(manualInput({ initialStatus: "PENDING" }), OWNER);
    const result = await service.listOrders({ source: "WEBSITE", status: "PENDING", page: 1, limit: 30 });
    expect(result.data).toHaveLength(1); expect(result.data[0].source).toBe("WEBSITE");
  });

  it("keeps delivery rates editable and allows an explicitly unconfigured charge", async () => {
    const { prisma } = createMemoryPrisma(); const service = createUnifiedOrderService(prisma);
    expect((await service.updateDeliveryRate(RATE, { charge: null }, OWNER)).charge).toBeNull();
    await expect(service.createWebsiteOrder(websiteInput())).rejects.toMatchObject({ code: "DELIVERY_RATE_NOT_CONFIGURED" });
  });

  it("writes actor/reason audit records for sensitive order transitions", async () => {
    const { prisma, state } = createMemoryPrisma(); const service = createUnifiedOrderService(prisma);
    const order = await service.createManualOrder(manualInput(), OWNER);
    await service.transitionOrder(order.id, { action: "CANCEL", reason: "Customer asked" }, OWNER);
    expect(state.audits.map((audit: any) => audit.action)).toEqual(["MANUAL_ORDER_CREATED", "ORDER_CANCELLED"]);
    expect(state.audits[1]).toMatchObject({ actorProfileId: OWNER, reason: "Customer asked" });
  });
});
