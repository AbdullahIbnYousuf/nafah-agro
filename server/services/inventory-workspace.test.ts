// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import { createInventoryService } from "./inventory.js";

const owner = { fullName: "Owner", role: "OWNER" as const };
const category = { id: "30000000-0000-4000-8000-000000000001", name: "চাল", isActive: true };
const product = { name: "মিনিকেট চাল", kind: "PACKAGED" as const, isActive: true, category };

function prismaMock(input: {
  variants?: unknown[];
  summaryBatches?: unknown[];
  itemBatches?: unknown[];
  purchaseBatches?: unknown[];
  adjustments?: unknown[];
}) {
  return {
    productVariant: {
      findMany: vi.fn(async () => input.variants ?? []),
      findUnique: vi.fn(async () => ({ id: "10000000-0000-4000-8000-000000000001" })),
    },
    stockBatch: {
      findMany: vi.fn(async (args: { where?: { source?: string } }) => {
        if (args.where?.source === "PURCHASE") return input.purchaseBatches ?? [];
        if (args.where && "productVariantId" in args.where) return input.itemBatches ?? [];
        return input.summaryBatches ?? [];
      }),
      count: vi.fn(async (args: { where?: { OR?: unknown } }) => args.where?.OR ? 1 : 2),
    },
    stockAdjustment: {
      findMany: vi.fn(async () => input.adjustments ?? []),
    },
  } as unknown as PrismaClient;
}

describe("inventory workspace service", () => {
  it("counts only active low-stock alerts and values available plus reserved stock", async () => {
    const prisma = prismaMock({
      variants: [
        { isActive: true, availableStock: 2, lowStockThreshold: 5, product },
        { isActive: true, availableStock: 0, lowStockThreshold: 5, product },
        { isActive: false, availableStock: 0, lowStockThreshold: 5, product },
      ],
      summaryBatches: [{
        availableQuantity: 2,
        reservedQuantity: 1,
        unitBuyingCost: new Prisma.Decimal(100),
        productVariant: { product: { kind: "PACKAGED" } },
      }],
    });

    await expect(createInventoryService(prisma).getInventorySummary()).resolves.toEqual({
      totalStockItems: 3,
      lowStockItems: 1,
      outOfStockItems: 1,
      inventoryValue: 300,
    });
  });

  it("returns one searchable row per stock identity with urgency sorting", async () => {
    const prisma = prismaMock({
      variants: [
        {
          id: "10000000-0000-4000-8000-000000000002",
          productId: "20000000-0000-4000-8000-000000000002",
          name: "Default",
          availableStock: 5_000,
          reservedStock: 0,
          lowStockThreshold: 2_000,
          isActive: true,
          product: { ...product, name: "খোলা ডাল", kind: "LOOSE_WEIGHT" },
          stockBatches: [{ purchaseDate: new Date("2026-09-11T00:00:00.000Z") }],
        },
        {
          id: "10000000-0000-4000-8000-000000000001",
          productId: "20000000-0000-4000-8000-000000000001",
          name: "৫ কেজি",
          availableStock: 0,
          reservedStock: 0,
          lowStockThreshold: 5,
          isActive: true,
          product,
          stockBatches: [],
        },
      ],
    });

    const result = await createInventoryService(prisma).listInventoryItems({
      query: undefined,
      categoryId: undefined,
      status: "ALL",
      sort: "URGENCY",
      page: 1,
      limit: 25,
    });

    expect(result.total).toBe(2);
    expect(result.data.map((item) => item.status)).toEqual(["OUT_OF_STOCK", "IN_STOCK"]);
    expect(result.data[1]).toMatchObject({ productName: "খোলা ডাল", quantityUnit: "GRAM", lastStockAddedAt: "2026-09-11" });
  });

  it("groups purchase batches and exposes decrease-adjustment reasons in previous records", async () => {
    const productVariant = {
      id: "10000000-0000-4000-8000-000000000001",
      name: "৫ কেজি",
      sku: "INTERNAL",
      availableStock: 3,
      reservedStock: 0,
      product,
    };
    const purchaseBase = {
      purchaseGroupId: "50000000-0000-4000-8000-000000000001",
      source: "PURCHASE",
      productVariantId: productVariant.id,
      purchasedQuantity: 2,
      availableQuantity: 2,
      reservedQuantity: 0,
      unitBuyingCost: new Prisma.Decimal(300),
      purchaseDate: new Date("2026-09-10T00:00:00.000Z"),
      note: "একই চালান",
      adjustmentReason: null,
      createdBy: owner,
      productVariant,
      createdAt: new Date("2026-09-10T06:00:00.000Z"),
    };
    const prisma = prismaMock({
      purchaseBatches: [
        { ...purchaseBase, id: "40000000-0000-4000-8000-000000000001" },
        { ...purchaseBase, id: "40000000-0000-4000-8000-000000000002", purchasedQuantity: 1 },
      ],
      adjustments: [{
        id: "60000000-0000-4000-8000-000000000001",
        productVariantId: productVariant.id,
        direction: "DECREASE",
        quantity: 1,
        unitBuyingCost: null,
        reason: "ভাঙা প্যাকেট",
        createdAt: new Date("2026-09-11T06:00:00.000Z"),
        createdBy: owner,
        productVariant,
      }],
    });

    const result = await createInventoryService(prisma).listInventoryRecords({
      query: undefined,
      type: "ALL",
      page: 1,
      limit: 25,
    });

    expect(result).toMatchObject({ total: 2 });
    expect(result.data[0]).toMatchObject({ type: "ADJUSTMENT", note: "ভাঙা প্যাকেট" });
    expect(result.data[1]).toMatchObject({ type: "PURCHASE", note: "একই চালান" });
    expect(result.data[1].items).toHaveLength(2);
  });
});
