// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import {
  physicalSaleCreateSchema,
  physicalSaleReturnSchema,
  purchaseCreateSchema,
  stockAdjustmentSchema,
} from "../schemas/inventory.js";
import { createInventoryService } from "./inventory.js";
import { SERIALIZABLE_TRANSACTION_OPTIONS } from "../lib/transactions.js";

const OWNER_ID = "4cd56ef4-56d8-4a22-92fe-887e6f601de6";
const VARIANT_A = "10000000-0000-4000-8000-000000000001";
const VARIANT_B = "10000000-0000-4000-8000-000000000002";
const PRODUCT_A = "20000000-0000-4000-8000-000000000001";
const PRODUCT_B = "20000000-0000-4000-8000-000000000002";

interface VariantRow {
  id: string;
  productId: string;
  name: string;
  sku: string;
  currentSellingPrice: string;
  availableStock: number;
  reservedStock: number;
  isActive: boolean;
  product: { id: string; name: string; isActive: boolean; kind: "PACKAGED" | "LOOSE_WEIGHT" | "LOOSE_VOLUME" };
}

interface BatchRow {
  id: string;
  purchaseGroupId: string | null;
  productVariantId: string;
  source: "PURCHASE" | "ADJUSTMENT" | "SELLABLE_RETURN";
  purchasedQuantity: number;
  availableQuantity: number;
  reservedQuantity: number;
  unitBuyingCost: string;
  purchaseDate: Date;
  note: string | null;
  adjustmentReason: string | null;
  createdByProfileId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface AdjustmentRow {
  id: string;
  productVariantId: string;
  direction: "INCREASE" | "DECREASE";
  quantity: number;
  unitBuyingCost: string | null;
  reason: string;
  createdByProfileId: string;
  createdAt: Date;
}

type MoneyValue = string | number | Prisma.Decimal;

interface SaleRow {
  id: string;
  orderNumber: string;
  source: "PHYSICAL_SHOP";
  status: "COMPLETED";
  paymentMethod: "CASH";
  paymentStatus: "PAID";
  customerName: string | null;
  customerPhone: string | null;
  subtotal: string;
  discountTotal: string;
  grandTotal: string;
  totalBuyingCost: string;
  grossProfit: string;
  grossProfitMargin: string | null;
  unprofitableOverrideConfirmed: boolean;
  unprofitableOverrideByProfileId: string | null;
  createdByProfileId: string;
  completedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface SaleItemRow {
  id: string;
  salesOrderId: string;
  productId: string;
  productVariantId: string;
  productNameSnapshot: string;
  variantNameSnapshot: string;
  skuSnapshot: string;
  quantity: number;
  quantityUnit: "PIECE" | "GRAM" | "MILLILITER";
  unitSellingPrice: string;
  grossLineRevenue: string;
  allocatedDiscount: string;
  netLineRevenue: string;
  totalBuyingCost: string;
  grossProfit: string;
  createdAt: Date;
}

interface AllocationRow {
  id: string;
  salesOrderItemId: string;
  stockBatchId: string;
  quantity: number;
  unitBuyingCost: string;
  totalBuyingCost: string;
  state: "CONSUMED";
  consumedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface PhysicalReturnRow {
  id: string;
  salesOrderId: string;
  condition: "SELLABLE" | "DAMAGED";
  reason: string;
  refundAmount: string;
  reversedBuyingCost: string;
  reversedGrossProfit: string;
  createdByProfileId: string;
  createdAt: Date;
}

interface PhysicalReturnItemRow {
  id: string;
  physicalSaleReturnId: string;
  salesOrderItemId: string;
  quantity: number;
  refundAmount: string;
  reversedBuyingCost: string;
  reversedGrossProfit: string;
  createdAt: Date;
}

interface PhysicalReturnAllocationRow {
  id: string;
  physicalSaleReturnItemId: string;
  orderAllocationId: string;
  restoredStockBatchId: string | null;
  quantity: number;
  unitBuyingCost: string;
  totalBuyingCost: string;
  createdAt: Date;
}

const money = (value: MoneyValue) => new Prisma.Decimal(value).toFixed(2);

function createInMemoryPrisma() {
  let sequence = 10;
  const id = () => `00000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`;
  const state: {
    variants: VariantRow[];
    batches: BatchRow[];
    adjustments: AdjustmentRow[];
    sales: SaleRow[];
    saleItems: SaleItemRow[];
    allocations: AllocationRow[];
    physicalReturns: PhysicalReturnRow[];
    physicalReturnItems: PhysicalReturnItemRow[];
    physicalReturnAllocations: PhysicalReturnAllocationRow[];
    audits: Array<Record<string, unknown>>;
    failBatchForVariant: string | null;
  } = {
    variants: [
      {
        id: VARIANT_A, productId: PRODUCT_A, name: "500 g", sku: "HONEY-500",
        currentSellingPrice: "500.00", availableStock: 0, reservedStock: 0, isActive: true,
        product: { id: PRODUCT_A, name: "Raw Honey", isActive: true, kind: "PACKAGED" },
      },
      {
        id: VARIANT_B, productId: PRODUCT_B, name: "1 kg", sku: "RICE-1KG",
        currentSellingPrice: "300.00", availableStock: 0, reservedStock: 0, isActive: true,
        product: { id: PRODUCT_B, name: "Red Rice", isActive: true, kind: "PACKAGED" },
      },
    ],
    batches: [], adjustments: [], sales: [], saleItems: [], allocations: [],
    physicalReturns: [], physicalReturnItems: [], physicalReturnAllocations: [], audits: [],
    failBatchForVariant: null,
  };

  const creator = { fullName: "Owner", role: "OWNER" as const };
  const hydrateBatch = (batch: BatchRow) => {
    const variant = state.variants.find((item) => item.id === batch.productVariantId)!;
    return { ...batch, productVariant: variant, createdBy: creator };
  };
  const hydrateSale = (sale: SaleRow) => ({
    ...sale,
    subtotal: new Prisma.Decimal(sale.subtotal),
    discountTotal: new Prisma.Decimal(sale.discountTotal),
    grandTotal: new Prisma.Decimal(sale.grandTotal),
    totalBuyingCost: new Prisma.Decimal(sale.totalBuyingCost),
    grossProfit: new Prisma.Decimal(sale.grossProfit),
    grossProfitMargin: sale.grossProfitMargin === null ? null : new Prisma.Decimal(sale.grossProfitMargin),
    createdBy: creator,
    physicalSaleReturns: state.physicalReturns.filter((value) => value.salesOrderId === sale.id).map((value) => ({
      ...value,
      refundAmount: new Prisma.Decimal(value.refundAmount),
      reversedBuyingCost: new Prisma.Decimal(value.reversedBuyingCost),
      reversedGrossProfit: new Prisma.Decimal(value.reversedGrossProfit),
      createdBy: creator,
      items: state.physicalReturnItems.filter((item) => item.physicalSaleReturnId === value.id).map((item) => ({
        ...item,
        refundAmount: new Prisma.Decimal(item.refundAmount),
        reversedBuyingCost: new Prisma.Decimal(item.reversedBuyingCost),
        reversedGrossProfit: new Prisma.Decimal(item.reversedGrossProfit),
        salesOrderItem: (() => {
          const soldItem = state.saleItems.find((candidate) => candidate.id === item.salesOrderItemId)!;
          return {
            productNameSnapshot: soldItem.productNameSnapshot,
            variantNameSnapshot: soldItem.variantNameSnapshot,
            quantityUnit: soldItem.quantityUnit,
          };
        })(),
      })),
    })),
    items: state.saleItems.filter((item) => item.salesOrderId === sale.id).map((item) => ({
      ...item,
      unitSellingPrice: new Prisma.Decimal(item.unitSellingPrice),
      grossLineRevenue: new Prisma.Decimal(item.grossLineRevenue),
      allocatedDiscount: new Prisma.Decimal(item.allocatedDiscount),
      netLineRevenue: new Prisma.Decimal(item.netLineRevenue),
      totalBuyingCost: new Prisma.Decimal(item.totalBuyingCost),
      grossProfit: new Prisma.Decimal(item.grossProfit),
      physicalSaleReturnItems: state.physicalReturnItems.filter((value) => value.salesOrderItemId === item.id).map((value) => ({
        ...value,
        refundAmount: new Prisma.Decimal(value.refundAmount),
        reversedBuyingCost: new Prisma.Decimal(value.reversedBuyingCost),
      })),
      allocations: state.allocations.filter((allocation) => allocation.salesOrderItemId === item.id).map((allocation) => ({
        ...allocation,
        unitBuyingCost: new Prisma.Decimal(allocation.unitBuyingCost),
        totalBuyingCost: new Prisma.Decimal(allocation.totalBuyingCost),
        physicalSaleReturnAllocations: state.physicalReturnAllocations.filter((value) => value.orderAllocationId === allocation.id).map((value) => ({
          ...value,
          totalBuyingCost: new Prisma.Decimal(value.totalBuyingCost),
        })),
        reservedAt: null,
        releasedAt: null,
        stockBatch: {
          purchaseDate: state.batches.find((batch) => batch.id === allocation.stockBatchId)!.purchaseDate,
        },
      })),
    })),
  });

  let transactionTail: Promise<void> = Promise.resolve();
  const transactionOptions: unknown[] = [];
  const api = {
    productVariant: {
      findMany: async ({ where }: { where: { id: { in: string[] }; isActive?: boolean } }) => state.variants
        .filter((variant) => where.id.in.includes(variant.id) && (where.isActive !== true || variant.isActive)),
      findUnique: async ({ where }: { where: { id: string } }) => state.variants.find((variant) => variant.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: { availableStock: { increment: number } } }) => {
        const variant = state.variants.find((item) => item.id === where.id)!;
        variant.availableStock += data.availableStock.increment;
        return variant;
      },
      updateMany: async ({ where, data }: {
        where: { id: string; availableStock: { gte: number } };
        data: { availableStock: { decrement: number } };
      }) => {
        const variant = state.variants.find((item) => item.id === where.id);
        if (!variant || variant.availableStock < where.availableStock.gte) return { count: 0 };
        variant.availableStock -= data.availableStock.decrement;
        return { count: 1 };
      },
    },
    stockBatch: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (state.failBatchForVariant === data.productVariantId) throw new Error("simulated batch failure");
        const now = new Date();
        const row: BatchRow = {
          id: id(),
          purchaseGroupId: (data.purchaseGroupId as string | undefined) ?? null,
          productVariantId: String(data.productVariantId),
          source: data.source as BatchRow["source"],
          purchasedQuantity: Number(data.purchasedQuantity),
          availableQuantity: Number(data.availableQuantity),
          reservedQuantity: 0,
          unitBuyingCost: money(data.unitBuyingCost as MoneyValue),
          purchaseDate: data.purchaseDate as Date,
          note: (data.note as string | undefined) ?? null,
          adjustmentReason: (data.adjustmentReason as string | undefined) ?? null,
          createdByProfileId: String(data.createdByProfileId),
          createdAt: now,
          updatedAt: now,
        };
        state.batches.push(row);
        return row;
      },
      updateMany: async ({ where, data }: {
        where: { id: string; availableQuantity: { gte: number } };
        data: { availableQuantity: { decrement: number } };
      }) => {
        const batch = state.batches.find((item) => item.id === where.id);
        if (!batch || batch.availableQuantity < where.availableQuantity.gte) return { count: 0 };
        batch.availableQuantity -= data.availableQuantity.decrement;
        batch.updatedAt = new Date();
        return { count: 1 };
      },
      findMany: async ({ where, take }: { where?: { id?: { in: string[] }; productVariantId?: string }; take?: number }) => {
        let rows = state.batches.filter((batch) => {
          if (where?.id && !where.id.in.includes(batch.id)) return false;
          if (where?.productVariantId && batch.productVariantId !== where.productVariantId) return false;
          return true;
        });
        rows = rows.sort((left, right) => right.purchaseDate.getTime() - left.purchaseDate.getTime());
        return rows.slice(0, take).map(hydrateBatch);
      },
    },
    stockAdjustment: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row: AdjustmentRow = {
          id: id(), productVariantId: String(data.productVariantId),
          direction: data.direction as AdjustmentRow["direction"], quantity: Number(data.quantity),
          unitBuyingCost: data.unitBuyingCost === null ? null : money(data.unitBuyingCost as MoneyValue),
          reason: String(data.reason), createdByProfileId: String(data.createdByProfileId), createdAt: new Date(),
        };
        state.adjustments.push(row);
        return row;
      },
    },
    salesOrder: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const now = new Date();
        const row: SaleRow = {
          id: id(), orderNumber: String(data.orderNumber), source: "PHYSICAL_SHOP", status: "COMPLETED",
          paymentMethod: "CASH", paymentStatus: "PAID",
          customerName: (data.customerName as string | undefined) ?? null,
          customerPhone: (data.customerPhone as string | undefined) ?? null,
          subtotal: money(data.subtotal as MoneyValue), discountTotal: money(data.discountTotal as MoneyValue),
          grandTotal: money(data.grandTotal as MoneyValue), totalBuyingCost: money(data.totalBuyingCost as MoneyValue),
          grossProfit: money(data.grossProfit as MoneyValue),
          grossProfitMargin: data.grossProfitMargin === null ? null : new Prisma.Decimal(data.grossProfitMargin as MoneyValue).toFixed(4),
          unprofitableOverrideConfirmed: Boolean(data.unprofitableOverrideConfirmed),
          unprofitableOverrideByProfileId: (data.unprofitableOverrideByProfileId as string | null) ?? null,
          createdByProfileId: String(data.createdByProfileId), completedAt: data.completedAt as Date,
          createdAt: now, updatedAt: now,
        };
        state.sales.push(row);
        return row;
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = state.sales.find((sale) => sale.id === where.id);
        return row ? hydrateSale(row) : null;
      },
      findMany: async ({ take }: { take: number }) => state.sales.slice(-take).reverse().map(hydrateSale),
    },
    salesOrderItem: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row: SaleItemRow = {
          id: id(), salesOrderId: String(data.salesOrderId), productId: String(data.productId),
          productVariantId: String(data.productVariantId), productNameSnapshot: String(data.productNameSnapshot),
          variantNameSnapshot: String(data.variantNameSnapshot), skuSnapshot: String(data.skuSnapshot),
          quantity: Number(data.quantity), unitSellingPrice: money(data.unitSellingPrice as MoneyValue),
          quantityUnit: (data.quantityUnit as SaleItemRow["quantityUnit"] | undefined) ?? "PIECE",
          grossLineRevenue: money(data.grossLineRevenue as MoneyValue),
          allocatedDiscount: money(data.allocatedDiscount as MoneyValue), netLineRevenue: money(data.netLineRevenue as MoneyValue),
          totalBuyingCost: money(data.totalBuyingCost as MoneyValue), grossProfit: money(data.grossProfit as MoneyValue),
          createdAt: new Date(),
        };
        state.saleItems.push(row);
        return row;
      },
    },
    orderAllocation: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const now = new Date();
        const row: AllocationRow = {
          id: id(), salesOrderItemId: String(data.salesOrderItemId), stockBatchId: String(data.stockBatchId),
          quantity: Number(data.quantity), unitBuyingCost: money(data.unitBuyingCost as MoneyValue),
          totalBuyingCost: money(data.totalBuyingCost as MoneyValue), state: "CONSUMED",
          consumedAt: data.consumedAt as Date, createdAt: now, updatedAt: now,
        };
        state.allocations.push(row);
        return row;
      },
    },
    physicalSaleReturn: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row: PhysicalReturnRow = {
          id: id(),
          salesOrderId: String(data.salesOrderId),
          condition: data.condition as PhysicalReturnRow["condition"],
          reason: String(data.reason),
          refundAmount: money(data.refundAmount as MoneyValue),
          reversedBuyingCost: money(data.reversedBuyingCost as MoneyValue),
          reversedGrossProfit: money(data.reversedGrossProfit as MoneyValue),
          createdByProfileId: String(data.createdByProfileId),
          createdAt: data.createdAt as Date,
        };
        state.physicalReturns.push(row);
        return row;
      },
    },
    physicalSaleReturnItem: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row: PhysicalReturnItemRow = {
          id: id(),
          physicalSaleReturnId: String(data.physicalSaleReturnId),
          salesOrderItemId: String(data.salesOrderItemId),
          quantity: Number(data.quantity),
          refundAmount: money(data.refundAmount as MoneyValue),
          reversedBuyingCost: money(data.reversedBuyingCost as MoneyValue),
          reversedGrossProfit: money(data.reversedGrossProfit as MoneyValue),
          createdAt: data.createdAt as Date,
        };
        state.physicalReturnItems.push(row);
        return row;
      },
    },
    physicalSaleReturnAllocation: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row: PhysicalReturnAllocationRow = {
          id: id(),
          physicalSaleReturnItemId: String(data.physicalSaleReturnItemId),
          orderAllocationId: String(data.orderAllocationId),
          restoredStockBatchId: (data.restoredStockBatchId as string | undefined) ?? null,
          quantity: Number(data.quantity),
          unitBuyingCost: money(data.unitBuyingCost as MoneyValue),
          totalBuyingCost: money(data.totalBuyingCost as MoneyValue),
          createdAt: data.createdAt as Date,
        };
        state.physicalReturnAllocations.push(row);
        return row;
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: id(), ...data, createdAt: new Date() };
        state.audits.push(row);
        return row;
      },
    },
    $queryRaw: async (query: { values: unknown[]; strings?: string[] }) => {
      if (String(query.strings).includes('FROM "sales_orders"')) {
        const saleId = String(query.values[0]);
        return state.sales.some((sale) => sale.id === saleId) ? [{ id: saleId }] : [];
      }
      const variantId = String(query.values[0]);
      return state.batches
        .filter((batch) => batch.productVariantId === variantId && batch.availableQuantity > 0)
        .sort((left, right) => left.purchaseDate.getTime() - right.purchaseDate.getTime()
          || left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id))
        .map((batch) => ({
          id: batch.id, availableQuantity: batch.availableQuantity,
          unitBuyingCost: new Prisma.Decimal(batch.unitBuyingCost),
          purchaseDate: batch.purchaseDate, createdAt: batch.createdAt,
        }));
    },
    $transaction: async (operation: unknown, options?: unknown) => {
      transactionOptions.push(options);
      if (Array.isArray(operation)) return Promise.all(operation);
      let release!: () => void;
      const previous = transactionTail;
      transactionTail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      const snapshot = structuredClone(state);
      try {
        return await (operation as (transaction: typeof api) => Promise<unknown>)(api);
      } catch (error) {
        Object.assign(state, snapshot);
        throw error;
      } finally {
        release();
      }
    },
  };
  return { prisma: api as unknown as PrismaClient, state, transactionOptions };
}

function purchase(items: Array<{ productVariantId: string; quantity: number; unitBuyingCost: string }>, date = "2026-07-01") {
  return purchaseCreateSchema.parse({ purchaseDate: date, note: "Supplier invoice", items: items.map(({ quantity, ...item }) => ({ ...item, amount: String(quantity), amountUnit: "PIECE" })) });
}

function sale(items: Array<{ productVariantId: string; quantity: number }>, discountTotal = "0", confirmUnprofitable = false) {
  return physicalSaleCreateSchema.parse({ items: items.map(({ quantity, ...item }) => ({ ...item, amount: String(quantity), amountUnit: "PIECE" })), discountTotal, confirmUnprofitable });
}

function physicalReturn(
  salesOrderItemId: string,
  quantity: number,
  condition: "SELLABLE" | "DAMAGED" = "SELLABLE",
) {
  return physicalSaleReturnSchema.parse({
    condition,
    reason: "Customer returned the product",
    items: [{ salesOrderItemId, amount: String(quantity), amountUnit: "PIECE" }],
  });
}

describe("Milestone 3 inventory and physical sales", () => {
  it("allows FIFO transactions enough time for a cold serverless database connection", async () => {
    const { prisma, transactionOptions } = createInMemoryPrisma();
    await createInventoryService(prisma).createPurchase(purchase([
      { productVariantId: VARIANT_A, quantity: 1, unitBuyingCost: "300" },
    ]), OWNER_ID);

    expect(transactionOptions).toContainEqual(SERIALIZABLE_TRANSACTION_OPTIONS);
    expect(SERIALIZABLE_TRANSACTION_OPTIONS).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 20_000,
    });
  });

  it("returns a retryable error when Prisma expires a stock transaction", async () => {
    const prisma = {
      $transaction: vi.fn().mockRejectedValue(Object.assign(new Error("Transaction expired"), { code: "P2028" })),
    } as unknown as PrismaClient;

    await expect(createInventoryService(prisma).createPhysicalSale(
      sale([{ productVariantId: VARIANT_A, quantity: 1 }]),
      OWNER_ID,
    )).rejects.toMatchObject({ status: 503, code: "TRANSACTION_TIMEOUT" });
  });

  it("creates a multi-item purchase as batches and updates stock totals", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const service = createInventoryService(prisma);
    const result = await service.createPurchase(purchase([
      { productVariantId: VARIANT_A, quantity: 5, unitBuyingCost: "300" },
      { productVariantId: VARIANT_B, quantity: 8, unitBuyingCost: "180" },
    ]), OWNER_ID);
    expect(result.batches).toHaveLength(2);
    expect(new Set(result.batches.map((batch) => batch.purchaseGroupId))).toEqual(new Set([result.purchaseGroupId]));
    expect(state.variants.map((variant) => variant.availableStock)).toEqual([5, 8]);
    expect(() => purchaseCreateSchema.parse({
      purchaseDate: "2026-08-01",
      items: [{ productVariantId: VARIANT_A, quantity: 0, unitBuyingCost: "0" }],
    })).toThrow();
  });

  it("rolls back every item when a later purchase batch fails", async () => {
    const { prisma, state } = createInMemoryPrisma();
    state.failBatchForVariant = VARIANT_B;
    const service = createInventoryService(prisma);
    await expect(service.createPurchase(purchase([
      { productVariantId: VARIANT_A, quantity: 5, unitBuyingCost: "300" },
      { productVariantId: VARIANT_B, quantity: 8, unitBuyingCost: "180" },
    ]), OWNER_ID)).rejects.toThrow("simulated batch failure");
    expect(state.batches).toHaveLength(0);
    expect(state.variants.map((variant) => variant.availableStock)).toEqual([0, 0]);
  });

  it("consumes one FIFO batch for a physical sale", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const service = createInventoryService(prisma);
    await service.createPurchase(purchase([{ productVariantId: VARIANT_A, quantity: 5, unitBuyingCost: "300" }]), OWNER_ID);
    const result = await service.createPhysicalSale(sale([{ productVariantId: VARIANT_A, quantity: 2 }]), OWNER_ID);
    expect(result.items[0].allocations).toHaveLength(1);
    expect(result.items[0].allocations[0]).toMatchObject({ quantity: 2, unitBuyingCost: 300 });
    expect(state.batches[0].availableQuantity).toBe(3);
    expect(state.variants[0].availableStock).toBe(3);
  });

  it("spans FIFO batches in purchase-date order", async () => {
    const { prisma } = createInMemoryPrisma();
    const service = createInventoryService(prisma);
    await service.createPurchase(purchase([{ productVariantId: VARIANT_A, quantity: 2, unitBuyingCost: "250" }], "2026-06-01"), OWNER_ID);
    await service.createPurchase(purchase([{ productVariantId: VARIANT_A, quantity: 4, unitBuyingCost: "320" }], "2026-07-01"), OWNER_ID);
    const result = await service.createPhysicalSale(sale([{ productVariantId: VARIANT_A, quantity: 5 }]), OWNER_ID);
    expect(result.items[0].allocations.map((allocation) => [allocation.quantity, allocation.unitBuyingCost]))
      .toEqual([[2, 250], [3, 320]]);
    expect(result.totalBuyingCost).toBe(1460);
  });

  it("rejects insufficient stock without changing stock", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const service = createInventoryService(prisma);
    await service.createPurchase(purchase([{ productVariantId: VARIANT_A, quantity: 1, unitBuyingCost: "300" }]), OWNER_ID);
    await expect(service.createPhysicalSale(sale([{ productVariantId: VARIANT_A, quantity: 2 }]), OWNER_ID))
      .rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(state.batches[0].availableQuantity).toBe(1);
    expect(state.variants[0].availableStock).toBe(1);
    expect(state.sales).toHaveLength(0);
  });

  it("protects the final unit from concurrent sales", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const service = createInventoryService(prisma);
    await service.createPurchase(purchase([{ productVariantId: VARIANT_A, quantity: 1, unitBuyingCost: "300" }]), OWNER_ID);
    const results = await Promise.allSettled([
      service.createPhysicalSale(sale([{ productVariantId: VARIANT_A, quantity: 1 }]), OWNER_ID),
      service.createPhysicalSale(sale([{ productVariantId: VARIANT_A, quantity: 1 }]), OWNER_ID),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(state.variants[0].availableStock).toBe(0);
    expect(state.allocations).toHaveLength(1);
  });

  it("records required-reason increases and FIFO decreases", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const service = createInventoryService(prisma);
    await service.adjustStock(stockAdjustmentSchema.parse({
      direction: "INCREASE", productVariantId: VARIANT_A, amount: "4", amountUnit: "PIECE",
      unitBuyingCost: "275", purchaseDate: "2026-07-10", reason: "Opening stock correction",
    }), OWNER_ID);
    await service.adjustStock(stockAdjustmentSchema.parse({
      direction: "DECREASE", productVariantId: VARIANT_A, amount: "1", amountUnit: "PIECE", reason: "Damaged during handling",
    }), OWNER_ID);
    expect(state.adjustments.map((adjustment) => adjustment.reason)).toEqual([
      "Opening stock correction", "Damaged during handling",
    ]);
    expect(state.batches[0]).toMatchObject({ source: "ADJUSTMENT", adjustmentReason: "Opening stock correction", availableQuantity: 3 });
    expect(() => stockAdjustmentSchema.parse({
      direction: "DECREASE", productVariantId: VARIANT_A, quantity: 1, reason: "",
    })).toThrow();
  });

  it("calculates server prices, discount, cost, gross profit, and margin", async () => {
    const { prisma } = createInMemoryPrisma();
    const service = createInventoryService(prisma);
    await service.createPurchase(purchase([{ productVariantId: VARIANT_A, quantity: 3, unitBuyingCost: "300" }]), OWNER_ID);
    const result = await service.createPhysicalSale(sale([{ productVariantId: VARIANT_A, quantity: 2 }], "100"), OWNER_ID);
    expect(result).toMatchObject({ subtotal: 1000, discountTotal: 100, grandTotal: 900, totalBuyingCost: 600, grossProfit: 300 });
    expect(result.grossProfitMargin).toBeCloseTo(33.3333, 4);
    expect(result.paymentMethod).toBe("CASH");
    expect(result.paymentStatus).toBe("PAID");
  });

  it("rejects a discount above subtotal and requires confirmation for a loss", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const service = createInventoryService(prisma);
    await service.createPurchase(purchase([{ productVariantId: VARIANT_A, quantity: 2, unitBuyingCost: "450" }]), OWNER_ID);
    await expect(service.createPhysicalSale(sale([{ productVariantId: VARIANT_A, quantity: 1 }], "501"), OWNER_ID))
      .rejects.toMatchObject({ code: "DISCOUNT_EXCEEDS_SUBTOTAL" });
    await expect(service.createPhysicalSale(sale([{ productVariantId: VARIANT_A, quantity: 1 }], "100"), OWNER_ID))
      .rejects.toMatchObject({ code: "UNPROFITABLE_SALE_CONFIRMATION_REQUIRED" });
    expect(state.variants[0].availableStock).toBe(2);
    const confirmed = await service.createPhysicalSale(sale([{ productVariantId: VARIANT_A, quantity: 1 }], "100", true), OWNER_ID);
    expect(confirmed).toMatchObject({ grossProfit: -50, unprofitableOverrideConfirmed: true });
  });

  it("preserves historical selling-price and FIFO-cost snapshots", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const service = createInventoryService(prisma);
    await service.createPurchase(purchase([{ productVariantId: VARIANT_A, quantity: 1, unitBuyingCost: "280" }]), OWNER_ID);
    const result = await service.createPhysicalSale(sale([{ productVariantId: VARIANT_A, quantity: 1 }]), OWNER_ID);
    state.variants[0].currentSellingPrice = "900.00";
    state.batches[0].unitBuyingCost = "100.00";
    const stored = (await service.listPhysicalSales({ limit: 10 }))[0];
    expect(result.items[0]).toMatchObject({ unitSellingPrice: 500, totalBuyingCost: 280 });
    expect(stored.items[0]).toMatchObject({ unitSellingPrice: 500, totalBuyingCost: 280 });
    expect(stored.items[0].allocations[0].unitBuyingCost).toBe(280);
  });

  it("keeps website and manual orders out of the physical-sales list", async () => {
    const { prisma } = createInMemoryPrisma();
    const findMany = vi.spyOn(prisma.salesOrder, "findMany");

    await createInventoryService(prisma).listPhysicalSales({ limit: 10 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { source: "PHYSICAL_SHOP", status: "COMPLETED" },
    }));
  });

  it("returns selected physical-sale quantities and restores only SELLABLE stock", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const service = createInventoryService(prisma);
    await service.createPurchase(purchase([{ productVariantId: VARIANT_A, quantity: 4, unitBuyingCost: "300" }]), OWNER_ID);
    const sold = await service.createPhysicalSale(sale([{ productVariantId: VARIANT_A, quantity: 2 }], "100"), OWNER_ID);

    const firstReturn = await service.returnPhysicalSale(
      sold.id,
      physicalReturn(sold.items[0].id, 1, "SELLABLE"),
      OWNER_ID,
    );

    expect(firstReturn).toMatchObject({
      refundedAmount: 450,
      remainingRevenue: 450,
      remainingBuyingCost: 300,
      remainingGrossProfit: 150,
    });
    expect(firstReturn.items[0]).toMatchObject({ returnedQuantity: 1, returnableQuantity: 1 });
    expect(firstReturn.returns[0]).toMatchObject({ condition: "SELLABLE", refundAmount: 450, reversedBuyingCost: 300 });
    expect(state.variants[0].availableStock).toBe(3);
    expect(state.batches.some((batch) => batch.source === "SELLABLE_RETURN" && batch.availableQuantity === 1)).toBe(true);

    const finalReturn = await service.returnPhysicalSale(
      sold.id,
      physicalReturn(sold.items[0].id, 1, "DAMAGED"),
      OWNER_ID,
    );
    expect(finalReturn).toMatchObject({ refundedAmount: 900, remainingRevenue: 0, remainingBuyingCost: 0, remainingGrossProfit: 0 });
    expect(finalReturn.items[0]).toMatchObject({ returnedQuantity: 2, returnableQuantity: 0 });
    expect(state.variants[0].availableStock).toBe(3);
  });

  it("rejects excess and repeated physical-sale returns without partial changes", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const service = createInventoryService(prisma);
    await service.createPurchase(purchase([{ productVariantId: VARIANT_A, quantity: 3, unitBuyingCost: "300" }]), OWNER_ID);
    const sold = await service.createPhysicalSale(sale([{ productVariantId: VARIANT_A, quantity: 1 }]), OWNER_ID);

    await expect(service.returnPhysicalSale(
      sold.id,
      physicalReturn(sold.items[0].id, 2),
      OWNER_ID,
    )).rejects.toMatchObject({ code: "RETURN_QUANTITY_EXCEEDED" });
    expect(state.physicalReturns).toHaveLength(0);

    await service.returnPhysicalSale(sold.id, physicalReturn(sold.items[0].id, 1), OWNER_ID);
    await expect(service.returnPhysicalSale(
      sold.id,
      physicalReturn(sold.items[0].id, 1),
      OWNER_ID,
    )).rejects.toMatchObject({ code: "RETURN_QUANTITY_EXCEEDED" });
    expect(state.physicalReturns).toHaveLength(1);
  });

  it("purchases and sells loose weight in exact grams with per-kilogram FIFO costs", async () => {
    const { prisma, state } = createInMemoryPrisma();
    state.variants[1].product.kind = "LOOSE_WEIGHT";
    state.variants[1].currentSellingPrice = "100.00";
    const service = createInventoryService(prisma);
    await service.createPurchase(purchaseCreateSchema.parse({
      purchaseDate: "2026-08-15",
      items: [{ productVariantId: VARIANT_B, amount: "100", amountUnit: "KG", unitBuyingCost: "60.00" }],
    }), OWNER_ID);
    const saleResult = await service.createPhysicalSale(physicalSaleCreateSchema.parse({
      items: [{ productVariantId: VARIANT_B, amount: "1.25", amountUnit: "KG" }],
      discountTotal: "0",
    }), OWNER_ID);
    expect(saleResult.items[0]).toMatchObject({ quantity: 1_250, quantityUnit: "GRAM", grossLineRevenue: 125, totalBuyingCost: 75 });
    expect(state.batches[0].availableQuantity).toBe(98_750);
    expect(state.variants[1].availableStock).toBe(98_750);
  });

  it("returns an exact loose-weight amount using the original rate and FIFO cost", async () => {
    const { prisma, state } = createInMemoryPrisma();
    state.variants[1].product.kind = "LOOSE_WEIGHT";
    state.variants[1].currentSellingPrice = "100.00";
    const service = createInventoryService(prisma);
    await service.createPurchase(purchaseCreateSchema.parse({
      purchaseDate: "2026-08-15",
      items: [{ productVariantId: VARIANT_B, amount: "10", amountUnit: "KG", unitBuyingCost: "60.00" }],
    }), OWNER_ID);
    const sold = await service.createPhysicalSale(physicalSaleCreateSchema.parse({
      items: [{ productVariantId: VARIANT_B, amount: "2", amountUnit: "KG" }],
      discountTotal: "0",
    }), OWNER_ID);

    const returned = await service.returnPhysicalSale(sold.id, physicalSaleReturnSchema.parse({
      condition: "SELLABLE",
      reason: "Customer returned loose rice",
      items: [{ salesOrderItemId: sold.items[0].id, amount: "500", amountUnit: "G" }],
    }), OWNER_ID);

    expect(returned).toMatchObject({ refundedAmount: 50, remainingRevenue: 150, remainingBuyingCost: 90, remainingGrossProfit: 60 });
    expect(returned.items[0]).toMatchObject({ returnedQuantity: 500, returnableQuantity: 1_500 });
    expect(state.variants[1].availableStock).toBe(8_500);
  });
});
