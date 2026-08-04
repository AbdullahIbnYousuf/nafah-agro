import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import type { AnalyticsDashboardQuery } from "../schemas/analytics.js";

export const ANALYTICS_CURRENCY = "BDT" as const;
export const ANALYTICS_TIMEZONE = "Asia/Dhaka" as const;

const DAY_MS = 86_400_000;
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1_000;
const SOURCES = ["WEBSITE", "PHYSICAL_SHOP", "FACEBOOK", "PHONE", "WHATSAPP", "OTHER"] as const;
const RETURN_STATUSES = ["RETURNED_SELLABLE", "RETURNED_DAMAGED"] as const;
const DELIVERY_STATUSES = ["DELIVERED", ...RETURN_STATUSES] as const;
const PHYSICAL_STATUSES = ["COMPLETED", ...RETURN_STATUSES] as const;

type Source = typeof SOURCES[number];
type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PROCESSING"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED"
  | typeof RETURN_STATUSES[number];
type MoneyValue = string | number | { toString(): string };

export interface AnalyticsOrderRecord {
  id: string;
  source: Source;
  status: OrderStatus;
  subtotal: MoneyValue;
  discountTotal: MoneyValue;
  deliveryCharge: MoneyValue;
  grandTotal: MoneyValue;
  completedAt: Date | null;
  deliveredAt: Date | null;
  returnedAt: Date | null;
  items: Array<{
    productId: string;
    productVariantId: string;
    productNameSnapshot: string;
    variantNameSnapshot: string;
    skuSnapshot: string;
    quantity: number;
    netLineRevenue: MoneyValue;
    totalBuyingCost: MoneyValue | null;
    allocations: Array<{ totalBuyingCost: MoneyValue }>;
  }>;
}

export interface AnalyticsStockBatchRecord {
  availableQuantity: number;
  reservedQuantity: number;
  unitBuyingCost: MoneyValue;
}

export interface AnalyticsVariantRecord {
  id: string;
  name: string;
  sku: string;
  availableStock: number;
  reservedStock: number;
  lowStockThreshold: number;
  product: { name: string };
}

export interface AnalyticsPeriod {
  from: string;
  to: string;
  startUtc: Date;
  endUtc: Date;
}

export interface AnalyticsRange {
  preset: AnalyticsDashboardQuery["preset"];
  current: AnalyticsPeriod;
  previous: AnalyticsPeriod;
}

export interface ComparedMetric {
  value: number | null;
  previousValue: number | null;
  absoluteChange: number | null;
  percentChange: number | null;
}

function decimal(value: MoneyValue | null | undefined) {
  return new Prisma.Decimal(value == null ? 0 : value.toString());
}

function decimalNumber(value: Prisma.Decimal, places = 2) {
  return Number(value.toDecimalPlaces(places, Prisma.Decimal.ROUND_HALF_UP).toString());
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function inclusiveDays(from: string, to: string) {
  return Math.floor((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS) + 1;
}

function period(from: string, to: string): AnalyticsPeriod {
  return {
    from,
    to,
    startUtc: new Date(`${from}T00:00:00+06:00`),
    endUtc: new Date(`${addDays(to, 1)}T00:00:00+06:00`),
  };
}

export function dhakaDate(date: Date) {
  return new Date(date.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
}

export function resolveAnalyticsRange(query: AnalyticsDashboardQuery, now = new Date()): AnalyticsRange {
  const today = dhakaDate(now);
  let from = today;
  let to = today;

  if (query.preset === "yesterday") {
    from = addDays(today, -1);
    to = from;
  } else if (query.preset === "week") {
    const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
    from = addDays(today, -weekday);
    to = addDays(from, 6);
  } else if (query.preset === "month") {
    from = `${today.slice(0, 7)}-01`;
    const [year, month] = today.split("-").map(Number);
    to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  } else if (query.preset === "custom") {
    if (!query.from || !query.to) throw new Error("Custom analytics ranges require from and to dates");
    from = query.from;
    to = query.to;
  }

  const days = inclusiveDays(from, to);
  const previousTo = addDays(from, -1);
  const previousFrom = addDays(previousTo, -(days - 1));
  return {
    preset: query.preset,
    current: period(from, to),
    previous: period(previousFrom, previousTo),
  };
}

function inPeriod(date: Date, value: AnalyticsPeriod) {
  return date >= value.startUtc && date < value.endUtc;
}

function isReturn(status: OrderStatus): status is typeof RETURN_STATUSES[number] {
  return status === "RETURNED_SELLABLE" || status === "RETURNED_DAMAGED";
}

function recognitionDate(order: AnalyticsOrderRecord) {
  if (order.source === "PHYSICAL_SHOP") {
    return PHYSICAL_STATUSES.includes(order.status as typeof PHYSICAL_STATUSES[number])
      ? order.completedAt
      : null;
  }
  return DELIVERY_STATUSES.includes(order.status as typeof DELIVERY_STATUSES[number])
    ? order.deliveredAt
    : null;
}

function itemCost(item: AnalyticsOrderRecord["items"][number]) {
  if (item.allocations.length > 0) {
    return item.allocations.reduce(
      (total, allocation) => total.plus(decimal(allocation.totalBuyingCost)),
      new Prisma.Decimal(0),
    );
  }
  return decimal(item.totalBuyingCost);
}

interface FinancialEvent {
  kind: "SALE" | "RETURN";
  date: Date;
  day: string;
  source: Source;
  recognizedSales: Prisma.Decimal;
  productRevenue: Prisma.Decimal;
  deliveryCharges: Prisma.Decimal;
  fifoCost: Prisma.Decimal;
  grossProfit: Prisma.Decimal;
  units: number;
  orderCount: number;
  items: Array<{
    productId: string;
    productVariantId: string;
    productName: string;
    variantName: string;
    sku: string;
    quantity: number;
    productRevenue: Prisma.Decimal;
    fifoCost: Prisma.Decimal;
    grossProfit: Prisma.Decimal;
  }>;
}

function financialEvent(order: AnalyticsOrderRecord, date: Date, kind: FinancialEvent["kind"]): FinancialEvent {
  const direction = kind === "SALE" ? new Prisma.Decimal(1) : new Prisma.Decimal(-1);
  const productRevenue = decimal(order.subtotal).minus(decimal(order.discountTotal)).mul(direction);
  const fifoCost = order.items.reduce(
    (total, item) => total.plus(itemCost(item)),
    new Prisma.Decimal(0),
  ).mul(direction);
  return {
    kind,
    date,
    day: dhakaDate(date),
    source: order.source,
    recognizedSales: decimal(order.grandTotal).mul(direction),
    productRevenue,
    deliveryCharges: decimal(order.deliveryCharge).mul(direction),
    fifoCost,
    grossProfit: productRevenue.minus(fifoCost),
    units: order.items.reduce((total, item) => total + item.quantity, 0) * (kind === "SALE" ? 1 : -1),
    orderCount: kind === "SALE" ? 1 : 0,
    items: order.items.map((item) => {
      const revenue = decimal(item.netLineRevenue).mul(direction);
      const cost = itemCost(item).mul(direction);
      return {
        productId: item.productId,
        productVariantId: item.productVariantId,
        productName: item.productNameSnapshot,
        variantName: item.variantNameSnapshot,
        sku: item.skuSnapshot,
        quantity: item.quantity * (kind === "SALE" ? 1 : -1),
        productRevenue: revenue,
        fifoCost: cost,
        grossProfit: revenue.minus(cost),
      };
    }),
  };
}

function eventsForPeriod(orders: AnalyticsOrderRecord[], value: AnalyticsPeriod) {
  const events: FinancialEvent[] = [];
  for (const order of orders) {
    const recognizedAt = recognitionDate(order);
    if (recognizedAt && inPeriod(recognizedAt, value)) {
      events.push(financialEvent(order, recognizedAt, "SALE"));
    }
    if (isReturn(order.status) && order.returnedAt && inPeriod(order.returnedAt, value)) {
      events.push(financialEvent(order, order.returnedAt, "RETURN"));
    }
  }
  return events;
}

function sumEvents(events: FinancialEvent[]) {
  return events.reduce((totals, event) => ({
    recognizedSales: totals.recognizedSales.plus(event.recognizedSales),
    productRevenue: totals.productRevenue.plus(event.productRevenue),
    deliveryCharges: totals.deliveryCharges.plus(event.deliveryCharges),
    fifoCost: totals.fifoCost.plus(event.fifoCost),
    grossProfit: totals.grossProfit.plus(event.grossProfit),
    units: totals.units + event.units,
    orderCount: totals.orderCount + event.orderCount,
  }), {
    recognizedSales: new Prisma.Decimal(0),
    productRevenue: new Prisma.Decimal(0),
    deliveryCharges: new Prisma.Decimal(0),
    fifoCost: new Prisma.Decimal(0),
    grossProfit: new Prisma.Decimal(0),
    units: 0,
    orderCount: 0,
  });
}

function compared(current: Prisma.Decimal | null, previous: Prisma.Decimal | null, places = 2): ComparedMetric {
  if (current === null || previous === null) {
    return {
      value: current === null ? null : decimalNumber(current, places),
      previousValue: previous === null ? null : decimalNumber(previous, places),
      absoluteChange: null,
      percentChange: null,
    };
  }
  const difference = current.minus(previous);
  return {
    value: decimalNumber(current, places),
    previousValue: decimalNumber(previous, places),
    absoluteChange: decimalNumber(difference, places),
    percentChange: previous.isZero()
      ? null
      : decimalNumber(difference.div(previous.abs()).mul(100), 2),
  };
}

function margin(profit: Prisma.Decimal, revenue: Prisma.Decimal) {
  return revenue.isZero() ? null : profit.div(revenue).mul(100);
}

function daySeries(from: string, to: string) {
  const values: string[] = [];
  for (let value = from; value <= to; value = addDays(value, 1)) values.push(value);
  return values;
}

interface ProductAggregate {
  productId: string;
  productVariantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  productRevenue: Prisma.Decimal;
  fifoCost: Prisma.Decimal;
  grossProfit: Prisma.Decimal;
}

function aggregateProducts(events: FinancialEvent[]) {
  const products = new Map<string, ProductAggregate>();
  for (const event of events) {
    for (const item of event.items) {
      const current = products.get(item.productVariantId) ?? {
        productId: item.productId,
        productVariantId: item.productVariantId,
        productName: item.productName,
        variantName: item.variantName,
        sku: item.sku,
        quantity: 0,
        productRevenue: new Prisma.Decimal(0),
        fifoCost: new Prisma.Decimal(0),
        grossProfit: new Prisma.Decimal(0),
      };
      current.quantity += item.quantity;
      current.productRevenue = current.productRevenue.plus(item.productRevenue);
      current.fifoCost = current.fifoCost.plus(item.fifoCost);
      current.grossProfit = current.grossProfit.plus(item.grossProfit);
      products.set(item.productVariantId, current);
    }
  }
  return [...products.values()];
}

function productDto(product: ProductAggregate) {
  return {
    productId: product.productId,
    productVariantId: product.productVariantId,
    productName: product.productName,
    variantName: product.variantName,
    sku: product.sku,
    quantity: product.quantity,
    productRevenue: decimalNumber(product.productRevenue),
    fifoCost: decimalNumber(product.fifoCost),
    grossProfit: decimalNumber(product.grossProfit),
    grossMargin: margin(product.grossProfit, product.productRevenue) === null
      ? null
      : decimalNumber(margin(product.grossProfit, product.productRevenue)!, 2),
  };
}

export function buildAnalyticsDashboard(input: {
  query: AnalyticsDashboardQuery;
  now?: Date;
  orders: AnalyticsOrderRecord[];
  openCodOrders: Array<{ status: "PENDING" | "CONFIRMED" | "PROCESSING" }>;
  stockBatches: AnalyticsStockBatchRecord[];
  variants: AnalyticsVariantRecord[];
}) {
  const now = input.now ?? new Date();
  const range = resolveAnalyticsRange(input.query, now);
  const currentEvents = eventsForPeriod(input.orders, range.current);
  const previousEvents = eventsForPeriod(input.orders, range.previous);
  const current = sumEvents(currentEvents);
  const previous = sumEvents(previousEvents);
  const currentMargin = margin(current.grossProfit, current.productRevenue);
  const previousMargin = margin(previous.grossProfit, previous.productRevenue);
  const currentAverage = current.orderCount === 0
    ? null
    : current.recognizedSales.div(current.orderCount);
  const previousAverage = previous.orderCount === 0
    ? null
    : previous.recognizedSales.div(previous.orderCount);

  const trendMap = new Map(daySeries(range.current.from, range.current.to).map((day) => [day, {
    date: day,
    recognizedSales: new Prisma.Decimal(0),
    grossProfit: new Prisma.Decimal(0),
  }]));
  for (const event of currentEvents) {
    const point = trendMap.get(event.day);
    if (!point) continue;
    point.recognizedSales = point.recognizedSales.plus(event.recognizedSales);
    point.grossProfit = point.grossProfit.plus(event.grossProfit);
  }

  const sourceMap = new Map(SOURCES.map((source) => [source, {
    source,
    orderCount: 0,
    recognizedSales: new Prisma.Decimal(0),
  }]));
  for (const event of currentEvents) {
    const source = sourceMap.get(event.source)!;
    source.orderCount += event.orderCount;
    source.recognizedSales = source.recognizedSales.plus(event.recognizedSales);
  }

  const products = aggregateProducts(currentEvents).filter((product) =>
    product.quantity !== 0 || !product.productRevenue.isZero() || !product.grossProfit.isZero(),
  );
  const bestSelling = [...products]
    .sort((a, b) => b.quantity - a.quantity || b.productRevenue.comparedTo(a.productRevenue))
    .slice(0, 10)
    .map(productDto);
  const mostProfitable = [...products]
    .sort((a, b) => b.grossProfit.comparedTo(a.grossProfit))
    .slice(0, 10)
    .map(productDto);

  const inventory = input.stockBatches.reduce((totals, batch) => {
    const onHand = batch.availableQuantity + batch.reservedQuantity;
    totals.availableUnits += batch.availableQuantity;
    totals.reservedUnits += batch.reservedQuantity;
    totals.onHandUnits += onHand;
    totals.valuation = totals.valuation.plus(decimal(batch.unitBuyingCost).mul(onHand));
    return totals;
  }, {
    availableUnits: 0,
    reservedUnits: 0,
    onHandUnits: 0,
    valuation: new Prisma.Decimal(0),
  });
  const stockVariantDto = (variant: AnalyticsVariantRecord) => ({
    productVariantId: variant.id,
    productName: variant.product.name,
    variantName: variant.name,
    sku: variant.sku,
    availableStock: variant.availableStock,
    reservedStock: variant.reservedStock,
    onHandStock: variant.availableStock + variant.reservedStock,
    lowStockThreshold: variant.lowStockThreshold,
  });
  const outOfStock = input.variants.filter((variant) => variant.availableStock === 0).map(stockVariantDto);
  const lowStock = input.variants
    .filter((variant) => variant.availableStock > 0 && variant.availableStock <= variant.lowStockThreshold)
    .sort((a, b) => a.availableStock - b.availableStock)
    .map(stockVariantDto);

  const pendingCod = input.openCodOrders.reduce((counts, order) => {
    if (order.status === "PENDING") counts.pending += 1;
    if (order.status === "CONFIRMED") counts.confirmed += 1;
    if (order.status === "PROCESSING") counts.processing += 1;
    counts.total += 1;
    return counts;
  }, { total: 0, pending: 0, confirmed: 0, processing: 0 });

  return {
    generatedAt: now.toISOString(),
    currency: ANALYTICS_CURRENCY,
    timezone: ANALYTICS_TIMEZONE,
    week: { startsOn: "SUNDAY", endsOn: "SATURDAY" },
    range: {
      preset: range.preset,
      current: { from: range.current.from, to: range.current.to },
      previous: { from: range.previous.from, to: range.previous.to },
    },
    summary: {
      recognizedSales: compared(current.recognizedSales, previous.recognizedSales),
      productRevenue: compared(current.productRevenue, previous.productRevenue),
      deliveryCharges: compared(current.deliveryCharges, previous.deliveryCharges),
      grossProfit: compared(current.grossProfit, previous.grossProfit),
      grossMargin: compared(currentMargin, previousMargin, 2),
      recognizedOrderCount: compared(decimal(current.orderCount), decimal(previous.orderCount), 0),
      unitsSold: compared(decimal(current.units), decimal(previous.units), 0),
      averageOrderValue: compared(currentAverage, previousAverage),
      pendingCodOrderCount: pendingCod.total,
      lowStockVariantCount: lowStock.length,
      outOfStockVariantCount: outOfStock.length,
    },
    trend: [...trendMap.values()].map((point) => ({
      date: point.date,
      recognizedSales: decimalNumber(point.recognizedSales),
      grossProfit: decimalNumber(point.grossProfit),
    })),
    salesBySource: [...sourceMap.values()].map((source) => ({
      source: source.source,
      orderCount: source.orderCount,
      recognizedSales: decimalNumber(source.recognizedSales),
    })),
    bestSelling,
    mostProfitable,
    inventory: {
      availableUnits: inventory.availableUnits,
      reservedUnits: inventory.reservedUnits,
      onHandUnits: inventory.onHandUnits,
      fifoValuation: decimalNumber(inventory.valuation),
      lowStock,
      outOfStock,
    },
    pendingCod,
  };
}

export function createAnalyticsService(prisma: PrismaClient) {
  return {
    async getDashboard(query: AnalyticsDashboardQuery) {
      const now = new Date();
      const range = resolveAnalyticsRange(query, now);
      const earliest = range.previous.startUtc;
      const latest = range.current.endUtc;
      const [orders, openCodOrders, stockBatches, variants] = await Promise.all([
        prisma.salesOrder.findMany({
          where: {
            OR: [
              { source: "PHYSICAL_SHOP", status: { in: [...PHYSICAL_STATUSES] }, completedAt: { gte: earliest, lt: latest } },
              { source: { not: "PHYSICAL_SHOP" }, status: { in: [...DELIVERY_STATUSES] }, deliveredAt: { gte: earliest, lt: latest } },
              { status: { in: [...RETURN_STATUSES] }, returnedAt: { gte: earliest, lt: latest } },
            ],
          },
          select: {
            id: true,
            source: true,
            status: true,
            subtotal: true,
            discountTotal: true,
            deliveryCharge: true,
            grandTotal: true,
            completedAt: true,
            deliveredAt: true,
            returnedAt: true,
            items: {
              select: {
                productId: true,
                productVariantId: true,
                productNameSnapshot: true,
                variantNameSnapshot: true,
                skuSnapshot: true,
                quantity: true,
                netLineRevenue: true,
                totalBuyingCost: true,
                allocations: { select: { totalBuyingCost: true } },
              },
            },
          },
        }),
        prisma.salesOrder.findMany({
          where: {
            paymentMethod: "CASH_ON_DELIVERY",
            status: { in: ["PENDING", "CONFIRMED", "PROCESSING"] },
          },
          select: { status: true },
        }),
        prisma.stockBatch.findMany({
          where: { OR: [{ availableQuantity: { gt: 0 } }, { reservedQuantity: { gt: 0 } }] },
          select: { availableQuantity: true, reservedQuantity: true, unitBuyingCost: true },
        }),
        prisma.productVariant.findMany({
          where: { isActive: true, product: { isActive: true } },
          select: {
            id: true,
            name: true,
            sku: true,
            availableStock: true,
            reservedStock: true,
            lowStockThreshold: true,
            product: { select: { name: true } },
          },
        }),
      ]);

      return buildAnalyticsDashboard({
        query,
        now,
        orders: orders as AnalyticsOrderRecord[],
        openCodOrders: openCodOrders as Array<{ status: "PENDING" | "CONFIRMED" | "PROCESSING" }>,
        stockBatches,
        variants,
      });
    },
  };
}

export type AnalyticsService = ReturnType<typeof createAnalyticsService>;
