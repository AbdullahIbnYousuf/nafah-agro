// @vitest-environment node

import { describe, expect, it } from "vitest";
import { analyticsDashboardQuerySchema } from "../schemas/analytics.js";
import {
  buildAnalyticsDashboard,
  resolveAnalyticsRange,
  type AnalyticsOrderRecord,
  type AnalyticsVariantRecord,
} from "./analytics.js";

const instant = (date: string, hour = 12) => new Date(`${date}T${String(hour).padStart(2, "0")}:00:00+06:00`);

function order(overrides: Partial<AnalyticsOrderRecord> & { id: string }): AnalyticsOrderRecord {
  return {
    id: overrides.id,
    source: "PHYSICAL_SHOP",
    status: "COMPLETED",
    subtotal: "500.00",
    discountTotal: "0.00",
    deliveryCharge: "0.00",
    grandTotal: "500.00",
    completedAt: instant("2026-08-04"),
    deliveredAt: null,
    returnedAt: null,
    items: [{
      productId: "product-1",
      productVariantId: "variant-1",
      productNameSnapshot: "Raw Honey",
      variantNameSnapshot: "500 g",
      skuSnapshot: "HONEY-500",
      quantity: 2,
      netLineRevenue: "500.00",
      totalBuyingCost: "200.00",
      allocations: [{ totalBuyingCost: "120.00" }, { totalBuyingCost: "80.00" }],
    }],
    ...overrides,
  };
}

function dashboard(overrides: Partial<Parameters<typeof buildAnalyticsDashboard>[0]> = {}) {
  return buildAnalyticsDashboard({
    query: { preset: "custom", from: "2026-08-04", to: "2026-08-04" },
    now: instant("2026-08-04"),
    orders: [],
    openCodOrders: [],
    stockBatches: [],
    variants: [],
    ...overrides,
  });
}

describe("analytics date boundaries", () => {
  it("uses Asia/Dhaka midnight for today", () => {
    const result = dashboard({
      query: { preset: "today" },
      now: new Date("2026-08-04T05:00:00.000Z"),
      orders: [
        order({ id: "inside", completedAt: new Date("2026-08-03T18:00:00.000Z") }),
        order({ id: "outside", completedAt: new Date("2026-08-03T17:59:59.999Z") }),
      ],
    });

    expect(result.range.current).toEqual({ from: "2026-08-04", to: "2026-08-04" });
    expect(result.summary.recognizedOrderCount.value).toBe(1);
    expect(result.summary.recognizedSales.value).toBe(500);
  });

  it("uses Sunday through Saturday for the reporting week", () => {
    const range = resolveAnalyticsRange({ preset: "week" }, instant("2026-08-05"));
    expect(range.current.from).toBe("2026-08-02");
    expect(range.current.to).toBe("2026-08-08");
    expect(range.previous.from).toBe("2026-07-26");
    expect(range.previous.to).toBe("2026-08-01");
  });

  it("rejects invalid and excessively large custom ranges", () => {
    expect(analyticsDashboardQuerySchema.safeParse({ preset: "custom", from: "2026-08-05", to: "2026-08-04" }).success).toBe(false);
    expect(analyticsDashboardQuerySchema.safeParse({ preset: "custom", from: "2025-01-01", to: "2026-08-04" }).success).toBe(false);
    expect(analyticsDashboardQuerySchema.safeParse({ preset: "custom", from: "2026-08-01" }).success).toBe(false);
  });
});

describe("recognized sales and returns", () => {
  it("recognizes physical COMPLETED and delivery DELIVERED orders", () => {
    const result = dashboard({ orders: [
      order({ id: "physical" }),
      order({
        id: "delivery",
        source: "WEBSITE",
        status: "DELIVERED",
        completedAt: null,
        deliveredAt: instant("2026-08-04"),
        deliveryCharge: "60.00",
        grandTotal: "560.00",
      }),
    ] });
    expect(result.summary.recognizedOrderCount.value).toBe(2);
    expect(result.summary.recognizedSales.value).toBe(1060);
  });

  it("excludes pending, confirmed, processing, and cancelled orders", () => {
    const statuses = ["PENDING", "CONFIRMED", "PROCESSING", "CANCELLED"] as const;
    const orders = statuses.map((status) => order({
      id: status,
      source: "WEBSITE",
      status,
      completedAt: null,
      deliveredAt: instant("2026-08-04"),
    }));
    const result = dashboard({ orders });
    expect(result.summary.recognizedSales.value).toBe(0);
    expect(result.summary.recognizedOrderCount.value).toBe(0);
  });

  it.each(["RETURNED_SELLABLE", "RETURNED_DAMAGED"] as const)(
    "posts a negative %s reversal on the return date",
    (status) => {
      const result = dashboard({ orders: [order({
        id: status,
        status,
        completedAt: instant("2026-08-01"),
        returnedAt: instant("2026-08-04"),
      })] });
      expect(result.summary.recognizedSales.value).toBe(-500);
      expect(result.summary.productRevenue.value).toBe(-500);
      expect(result.summary.grossProfit.value).toBe(-300);
      expect(result.summary.unitsSold.value).toBe(-2);
      expect(result.trend[0]).toMatchObject({ recognizedSales: -500, grossProfit: -300 });
    },
  );

  it("separates grand-total revenue, product revenue, delivery charge, and FIFO cost", () => {
    const result = dashboard({ orders: [order({
      id: "delivery",
      source: "WEBSITE",
      status: "DELIVERED",
      completedAt: null,
      deliveredAt: instant("2026-08-04"),
      subtotal: "1000.00",
      discountTotal: "100.00",
      deliveryCharge: "60.00",
      grandTotal: "960.00",
      items: [{
        productId: "product-1",
        productVariantId: "variant-1",
        productNameSnapshot: "Rice",
        variantNameSnapshot: "5 kg",
        skuSnapshot: "RICE-5KG",
        quantity: 1,
        netLineRevenue: "900.00",
        totalBuyingCost: "999.00",
        allocations: [{ totalBuyingCost: "400.00" }, { totalBuyingCost: "100.00" }],
      }],
    })] });
    expect(result.summary.recognizedSales.value).toBe(960);
    expect(result.summary.productRevenue.value).toBe(900);
    expect(result.summary.deliveryCharges.value).toBe(60);
    expect(result.summary.grossProfit.value).toBe(400);
    expect(result.summary.grossMargin.value).toBe(44.44);
  });

  it("returns a null margin safely when net product revenue is zero", () => {
    const result = dashboard({ orders: [order({
      id: "same-day-return",
      status: "RETURNED_SELLABLE",
      returnedAt: instant("2026-08-04", 15),
    })] });
    expect(result.summary.productRevenue.value).toBe(0);
    expect(result.summary.grossProfit.value).toBe(0);
    expect(result.summary.grossMargin.value).toBeNull();
  });

  it("compares against the immediately preceding equivalent period", () => {
    const result = dashboard({ orders: [
      order({ id: "current", grandTotal: "200.00", subtotal: "200.00", items: [] }),
      order({ id: "previous", completedAt: instant("2026-08-03"), grandTotal: "100.00", subtotal: "100.00", items: [] }),
    ] });
    expect(result.summary.recognizedSales).toEqual({
      value: 200,
      previousValue: 100,
      absoluteChange: 100,
      percentChange: 100,
    });
  });
});

describe("analytics sections", () => {
  it("groups recognized sales by all supported sources", () => {
    const sources = ["WEBSITE", "PHYSICAL_SHOP", "FACEBOOK", "PHONE", "WHATSAPP", "OTHER"] as const;
    const orders = sources.map((source, index) => order({
      id: source,
      source,
      status: source === "PHYSICAL_SHOP" ? "COMPLETED" : "DELIVERED",
      completedAt: source === "PHYSICAL_SHOP" ? instant("2026-08-04") : null,
      deliveredAt: source === "PHYSICAL_SHOP" ? null : instant("2026-08-04"),
      grandTotal: String((index + 1) * 100),
    }));
    const result = dashboard({ orders });
    expect(result.salesBySource).toHaveLength(6);
    expect(result.salesBySource.find((item) => item.source === "WHATSAPP")).toMatchObject({ orderCount: 1, recognizedSales: 500 });
  });

  it("ranks best-selling variants by net returned quantity", () => {
    const result = dashboard({ orders: [
      order({ id: "honey" }),
      order({ id: "rice", items: [{
        productId: "product-2", productVariantId: "variant-2", productNameSnapshot: "Rice",
        variantNameSnapshot: "5 kg", skuSnapshot: "RICE-5", quantity: 5,
        netLineRevenue: "1000.00", totalBuyingCost: "500.00", allocations: [{ totalBuyingCost: "500.00" }],
      }] }),
      order({ id: "rice-return", status: "RETURNED_DAMAGED", completedAt: instant("2026-08-01"), returnedAt: instant("2026-08-04"), items: [{
        productId: "product-2", productVariantId: "variant-2", productNameSnapshot: "Rice",
        variantNameSnapshot: "5 kg", skuSnapshot: "RICE-5", quantity: 2,
        netLineRevenue: "400.00", totalBuyingCost: "200.00", allocations: [{ totalBuyingCost: "200.00" }],
      }] }),
    ] });
    expect(result.bestSelling[0]).toMatchObject({ productVariantId: "variant-2", quantity: 3 });
    expect(result.bestSelling[1]).toMatchObject({ productVariantId: "variant-1", quantity: 2 });
  });

  it("ranks most-profitable variants using FIFO allocation snapshots", () => {
    const result = dashboard({ orders: [
      order({ id: "honey" }),
      order({ id: "rice", items: [{
        productId: "product-2", productVariantId: "variant-2", productNameSnapshot: "Rice",
        variantNameSnapshot: "5 kg", skuSnapshot: "RICE-5", quantity: 1,
        netLineRevenue: "800.00", totalBuyingCost: "700.00", allocations: [{ totalBuyingCost: "100.00" }],
      }] }),
    ] });
    expect(result.mostProfitable[0]).toMatchObject({ productVariantId: "variant-2", fifoCost: 100, grossProfit: 700 });
  });

  it("calculates available, reserved, on-hand, valuation, and stock alerts", () => {
    const variants: AnalyticsVariantRecord[] = [
      { id: "v1", name: "500 g", sku: "ONE", availableStock: 2, reservedStock: 1, lowStockThreshold: 3, product: { name: "Honey" } },
      { id: "v2", name: "1 kg", sku: "TWO", availableStock: 0, reservedStock: 2, lowStockThreshold: 4, product: { name: "Rice" } },
      { id: "v3", name: "1 L", sku: "THREE", availableStock: 10, reservedStock: 0, lowStockThreshold: 2, product: { name: "Oil" } },
    ];
    const result = dashboard({
      stockBatches: [
        { availableQuantity: 2, reservedQuantity: 1, unitBuyingCost: "100.00" },
        { availableQuantity: 0, reservedQuantity: 2, unitBuyingCost: "50.00" },
        { availableQuantity: 10, reservedQuantity: 0, unitBuyingCost: "20.00" },
      ],
      variants,
      openCodOrders: [{ status: "PENDING" }, { status: "CONFIRMED" }, { status: "PROCESSING" }],
    });
    expect(result.inventory).toMatchObject({ availableUnits: 12, reservedUnits: 3, onHandUnits: 15, fifoValuation: 600 });
    expect(result.summary.lowStockVariantCount).toBe(1);
    expect(result.summary.outOfStockVariantCount).toBe(1);
    expect(result.pendingCod).toEqual({ total: 3, pending: 1, confirmed: 1, processing: 1 });
  });
});
