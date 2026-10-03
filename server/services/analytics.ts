import { Prisma, type PaymentChannel, type PrismaClient } from "../generated/prisma/client.js";
import type { AnalyticsDashboardQuery } from "../schemas/analytics.js";
import { quantityCost, type ProductKindValue, type QuantityUnitValue } from "../lib/quantity.js";

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

export function summarizePaymentChannels(input: {
  paidShopSales: Array<{ grandTotal: MoneyValue; paymentChannel: PaymentChannel | null }>;
  customerPayments: Array<{ amount: MoneyValue; paymentChannel: PaymentChannel | null }>;
  legacyPayments: Array<{ amount: MoneyValue; paymentChannel: PaymentChannel | null }>;
  payouts: Array<{ cashRefundAmount: MoneyValue; refundChannel: PaymentChannel | null }>;
}) {
  const methods = ["CASH", "BKASH", "NAGAD", "ROCKET", "BANK"] as const;
  const receivedByMethod = new Map(methods.map((method) => [method, new Prisma.Decimal(0)]));
  const refundedByMethod = new Map(methods.map((method) => [method, new Prisma.Decimal(0)]));
  for (const sale of input.paidShopSales) {
    const method = sale.paymentChannel ?? "CASH";
    receivedByMethod.set(method, receivedByMethod.get(method)!.plus(String(sale.grandTotal)));
  }
  for (const payment of [...input.customerPayments, ...input.legacyPayments]) {
    const method = payment.paymentChannel ?? "CASH";
    receivedByMethod.set(method, receivedByMethod.get(method)!.plus(String(payment.amount)));
  }
  for (const payout of input.payouts) {
    const method = payout.refundChannel ?? "CASH";
    refundedByMethod.set(method, refundedByMethod.get(method)!.plus(String(payout.cashRefundAmount)));
  }
  return methods.map((method) => ({
    method,
    received: Number(receivedByMethod.get(method)!.toDecimalPlaces(2)),
    refunded: Number(refundedByMethod.get(method)!.toDecimalPlaces(2)),
    net: Number(receivedByMethod.get(method)!.minus(refundedByMethod.get(method)!).toDecimalPlaces(2)),
  }));
}

export interface AnalyticsOrderRecord {
  id: string;
  source: Source;
  status: OrderStatus;
  paymentMethod: "CASH" | "CASH_ON_DELIVERY" | "CREDIT";
  subtotal: MoneyValue;
  discountTotal: MoneyValue;
  priceIncreaseTotal?: MoneyValue;
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
    quantityUnit?: QuantityUnitValue;
    unitLabelSnapshot?: string;
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
  productVariant?: { product: { kind: ProductKindValue } };
}

export interface AnalyticsPhysicalSaleReturnRecord {
  createdAt: Date;
  refundAmount: MoneyValue;
  reversedBuyingCost: MoneyValue;
  reversedGrossProfit: MoneyValue;
  salesOrder: { paymentMethod: "CASH" | "CREDIT" };
  items: Array<{
    quantity: number;
    refundAmount: MoneyValue;
    reversedBuyingCost: MoneyValue;
    reversedGrossProfit: MoneyValue;
    salesOrderItem: {
      productId: string;
      productVariantId: string;
      productNameSnapshot: string;
      variantNameSnapshot: string;
      skuSnapshot: string;
      quantityUnit?: QuantityUnitValue;
      unitLabelSnapshot?: string;
    };
  }>;
}

export interface AnalyticsInventoryOperationRecord {
  type: "STOCK_LOSS" | "ENTRY_CORRECTION" | "STOCK_RECONCILIATION";
  effectiveDate: Date;
  recognizedCostImpact: MoneyValue;
  stockLossAmount: MoneyValue;
  productVariant: {
    product: { id: string; name: string; kind?: ProductKindValue };
    id: string;
    name: string;
    sku: string;
    unitLabel?: string;
  };
}

export interface AnalyticsVariantRecord {
  id: string;
  name: string;
  sku: string;
  availableStock: number;
  reservedStock: number;
  lowStockThreshold: number;
  unitLabel?: string;
  product: { name: string; kind?: ProductKindValue };
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

function shiftMonths(value: string, months: number) {
  const [year, month, day] = value.split("-").map(Number);
  const firstOfTarget = new Date(Date.UTC(year, month - 1 + months, 1));
  const targetYear = firstOfTarget.getUTCFullYear();
  const targetMonth = firstOfTarget.getUTCMonth();
  const lastTargetDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastTargetDay))).toISOString().slice(0, 10);
}

function shiftYears(value: string, years: number) {
  const [year, month, day] = value.split("-").map(Number);
  const lastTargetDay = new Date(Date.UTC(year + years, month, 0)).getUTCDate();
  return new Date(Date.UTC(year + years, month - 1, Math.min(day, lastTargetDay))).toISOString().slice(0, 10);
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
    to = today;
  } else if (query.preset === "month") {
    from = `${today.slice(0, 7)}-01`;
    to = today;
  } else if (query.preset === "year") {
    const year = today.slice(0, 4);
    from = `${year}-01-01`;
    to = today;
  } else if (query.preset === "custom") {
    if (!query.from || !query.to) throw new Error("Custom analytics ranges require from and to dates");
    from = query.from;
    to = query.to;
  }

  const days = inclusiveDays(from, to);
  let previousFrom: string;
  let previousTo: string;
  if (query.preset === "week") {
    previousFrom = addDays(from, -7);
    previousTo = addDays(to, -7);
  } else if (query.preset === "month") {
    previousFrom = shiftMonths(from, -1);
    previousTo = shiftMonths(to, -1);
  } else if (query.preset === "year") {
    previousFrom = shiftYears(from, -1);
    previousTo = shiftYears(to, -1);
  } else {
    previousTo = addDays(from, -1);
    previousFrom = addDays(previousTo, -(days - 1));
  }
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
  kind: "SALE" | "RETURN" | "COST_CORRECTION";
  date: Date;
  day: string;
  source: Source;
  recognizedSales: Prisma.Decimal;
  productRevenue: Prisma.Decimal;
  cashProductRevenue: Prisma.Decimal;
  creditProductRevenue: Prisma.Decimal;
  deliveryCharges: Prisma.Decimal;
  fifoCost: Prisma.Decimal;
  grossProfit: Prisma.Decimal;
  quantities: QuantityTotals;
  orderCount: number;
  items: Array<{
    productId: string;
    productVariantId: string;
    productName: string;
    variantName: string;
    sku: string;
    quantityUnit: QuantityUnitValue;
    unitLabel?: string;
    quantity: number;
    productRevenue: Prisma.Decimal;
    fifoCost: Prisma.Decimal;
    grossProfit: Prisma.Decimal;
  }>;
}

function inventoryCostCorrectionEvent(value: AnalyticsInventoryOperationRecord): FinancialEvent {
  const costImpact = decimal(value.recognizedCostImpact);
  return {
    kind: "COST_CORRECTION",
    date: value.effectiveDate,
    day: dhakaDate(value.effectiveDate),
    source: "OTHER",
    recognizedSales: new Prisma.Decimal(0),
    productRevenue: new Prisma.Decimal(0),
    cashProductRevenue: new Prisma.Decimal(0),
    creditProductRevenue: new Prisma.Decimal(0),
    deliveryCharges: new Prisma.Decimal(0),
    fifoCost: costImpact,
    grossProfit: costImpact.negated(),
    quantities: emptyQuantities(),
    orderCount: 0,
    items: [{
      productId: value.productVariant.product.id,
      productVariantId: value.productVariant.id,
      productName: value.productVariant.product.name,
      variantName: value.productVariant.name,
      sku: value.productVariant.sku,
      quantityUnit: value.productVariant.product.kind === "LOOSE_WEIGHT" ? "GRAM" : value.productVariant.product.kind === "LOOSE_VOLUME" ? "MILLILITER" : "PIECE",
      quantity: 0,
      productRevenue: new Prisma.Decimal(0),
      fifoCost: costImpact,
      grossProfit: costImpact.negated(),
    }],
  };
}

function inventoryStockLossEvent(value: AnalyticsInventoryOperationRecord): FinancialEvent {
  const loss = decimal(value.stockLossAmount);
  return {
    kind: "COST_CORRECTION",
    date: value.effectiveDate,
    day: dhakaDate(value.effectiveDate),
    source: "OTHER",
    recognizedSales: new Prisma.Decimal(0),
    productRevenue: new Prisma.Decimal(0),
    cashProductRevenue: new Prisma.Decimal(0),
    creditProductRevenue: new Prisma.Decimal(0),
    deliveryCharges: new Prisma.Decimal(0),
    fifoCost: loss,
    grossProfit: loss.negated(),
    quantities: emptyQuantities(),
    orderCount: 0,
    items: [{
      productId: value.productVariant.product.id,
      productVariantId: value.productVariant.id,
      productName: value.productVariant.product.name,
      variantName: value.productVariant.name,
      sku: value.productVariant.sku,
      quantityUnit: value.productVariant.product.kind === "LOOSE_WEIGHT" ? "GRAM" : value.productVariant.product.kind === "LOOSE_VOLUME" ? "MILLILITER" : "PIECE",
      quantity: 0,
      productRevenue: new Prisma.Decimal(0),
      fifoCost: loss,
      grossProfit: loss.negated(),
    }],
  };
}

interface QuantityTotals {
  pieces: number;
  grams: number;
  milliliters: number;
}

function emptyQuantities(): QuantityTotals {
  return { pieces: 0, grams: 0, milliliters: 0 };
}

function addQuantity(total: QuantityTotals, unit: QuantityUnitValue | undefined, amount: number) {
  if (unit === "GRAM") total.grams += amount;
  else if (unit === "MILLILITER") total.milliliters += amount;
  else total.pieces += amount;
}

function financialEvent(order: AnalyticsOrderRecord, date: Date, kind: FinancialEvent["kind"]): FinancialEvent {
  const direction = kind === "SALE" ? new Prisma.Decimal(1) : new Prisma.Decimal(-1);
  const quantityDirection = kind === "SALE" ? 1 : -1;
  const quantities = emptyQuantities();
  for (const item of order.items) addQuantity(quantities, item.quantityUnit, item.quantity * quantityDirection);
  const productRevenue = decimal(order.subtotal).minus(decimal(order.discountTotal)).plus(decimal(order.priceIncreaseTotal ?? 0)).mul(direction);
  const isCredit = order.paymentMethod === "CREDIT";
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
    cashProductRevenue: isCredit ? new Prisma.Decimal(0) : productRevenue,
    creditProductRevenue: isCredit ? productRevenue : new Prisma.Decimal(0),
    deliveryCharges: decimal(order.deliveryCharge).mul(direction),
    fifoCost,
    grossProfit: productRevenue.minus(fifoCost),
    quantities,
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
        quantityUnit: item.quantityUnit ?? "PIECE",
        unitLabel: item.unitLabelSnapshot,
        quantity: item.quantity * quantityDirection,
        productRevenue: revenue,
        fifoCost: cost,
        grossProfit: revenue.minus(cost),
      };
    }),
  };
}

function physicalSaleReturnEvent(value: AnalyticsPhysicalSaleReturnRecord): FinancialEvent {
  const quantities = emptyQuantities();
  for (const item of value.items) addQuantity(quantities, item.salesOrderItem.quantityUnit, -item.quantity);
  const productRevenue = decimal(value.refundAmount).negated();
  const isCredit = value.salesOrder.paymentMethod === "CREDIT";
  return {
    kind: "RETURN",
    date: value.createdAt,
    day: dhakaDate(value.createdAt),
    source: "PHYSICAL_SHOP",
    recognizedSales: decimal(value.refundAmount).negated(),
    productRevenue,
    cashProductRevenue: isCredit ? new Prisma.Decimal(0) : productRevenue,
    creditProductRevenue: isCredit ? productRevenue : new Prisma.Decimal(0),
    deliveryCharges: new Prisma.Decimal(0),
    fifoCost: decimal(value.reversedBuyingCost).negated(),
    grossProfit: decimal(value.reversedGrossProfit).negated(),
    quantities,
    orderCount: 0,
    items: value.items.map((item) => ({
      productId: item.salesOrderItem.productId,
      productVariantId: item.salesOrderItem.productVariantId,
      productName: item.salesOrderItem.productNameSnapshot,
      variantName: item.salesOrderItem.variantNameSnapshot,
      sku: item.salesOrderItem.skuSnapshot,
      quantityUnit: item.salesOrderItem.quantityUnit ?? "PIECE",
      unitLabel: item.salesOrderItem.unitLabelSnapshot,
      quantity: -item.quantity,
      productRevenue: decimal(item.refundAmount).negated(),
      fifoCost: decimal(item.reversedBuyingCost).negated(),
      grossProfit: decimal(item.reversedGrossProfit).negated(),
    })),
  };
}

function eventsForPeriod(
  orders: AnalyticsOrderRecord[],
  physicalSaleReturns: AnalyticsPhysicalSaleReturnRecord[],
  inventoryOperations: AnalyticsInventoryOperationRecord[],
  value: AnalyticsPeriod,
) {
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
  for (const physicalReturn of physicalSaleReturns) {
    if (inPeriod(physicalReturn.createdAt, value)) events.push(physicalSaleReturnEvent(physicalReturn));
  }
  for (const operation of inventoryOperations) {
    if (!inPeriod(operation.effectiveDate, value)) continue;
    if (operation.type === "ENTRY_CORRECTION" && !decimal(operation.recognizedCostImpact).isZero()) {
      events.push(inventoryCostCorrectionEvent(operation));
    } else if ((operation.type === "STOCK_LOSS" || operation.type === "STOCK_RECONCILIATION") && !decimal(operation.stockLossAmount).isZero()) {
      events.push(inventoryStockLossEvent(operation));
    }
  }
  return events;
}

function sumEvents(events: FinancialEvent[]) {
  return events.reduce((totals, event) => {
    totals.recognizedSales = totals.recognizedSales.plus(event.recognizedSales);
    totals.productRevenue = totals.productRevenue.plus(event.productRevenue);
    totals.cashProductRevenue = totals.cashProductRevenue.plus(event.cashProductRevenue);
    totals.creditProductRevenue = totals.creditProductRevenue.plus(event.creditProductRevenue);
    totals.deliveryCharges = totals.deliveryCharges.plus(event.deliveryCharges);
    totals.fifoCost = totals.fifoCost.plus(event.fifoCost);
    totals.grossProfit = totals.grossProfit.plus(event.grossProfit);
    totals.quantities.pieces += event.quantities.pieces;
    totals.quantities.grams += event.quantities.grams;
    totals.quantities.milliliters += event.quantities.milliliters;
    totals.orderCount += event.orderCount;
    return totals;
  }, {
    recognizedSales: new Prisma.Decimal(0),
    productRevenue: new Prisma.Decimal(0),
    cashProductRevenue: new Prisma.Decimal(0),
    creditProductRevenue: new Prisma.Decimal(0),
    deliveryCharges: new Prisma.Decimal(0),
    fifoCost: new Prisma.Decimal(0),
    grossProfit: new Prisma.Decimal(0),
    quantities: emptyQuantities(),
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

type TrendGranularity = "DAY" | "MONTH";

interface TrendBucket {
  from: string;
  to: string;
  recognizedSales: Prisma.Decimal;
  grossProfit: Prisma.Decimal;
}

function trendBuckets(periodValue: AnalyticsPeriod, granularity: TrendGranularity) {
  const buckets = new Map<string, TrendBucket>();
  for (const day of daySeries(periodValue.from, periodValue.to)) {
    const key = granularity === "DAY" ? day : day.slice(0, 7);
    const existing = buckets.get(key);
    if (existing) {
      existing.to = day;
      continue;
    }
    buckets.set(key, {
      from: day,
      to: day,
      recognizedSales: new Prisma.Decimal(0),
      grossProfit: new Prisma.Decimal(0),
    });
  }
  return buckets;
}

function trendForPeriod(
  periodValue: AnalyticsPeriod,
  events: FinancialEvent[],
  granularity: TrendGranularity,
) {
  const buckets = trendBuckets(periodValue, granularity);
  for (const event of events) {
    const key = granularity === "DAY" ? event.day : event.day.slice(0, 7);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.recognizedSales = bucket.recognizedSales.plus(event.recognizedSales);
    bucket.grossProfit = bucket.grossProfit.plus(event.grossProfit);
  }
  return [...buckets.values()];
}

function trendBucketDto(bucket: TrendBucket) {
  return {
    from: bucket.from,
    to: bucket.to,
    recognizedSales: decimalNumber(bucket.recognizedSales),
    grossProfit: decimalNumber(bucket.grossProfit),
  };
}

interface ProductAggregate {
  productId: string;
  productVariantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantityUnit: QuantityUnitValue;
  unitLabel?: string;
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
        quantityUnit: item.quantityUnit,
        unitLabel: item.unitLabel,
        quantity: 0,
        productRevenue: new Prisma.Decimal(0),
        fifoCost: new Prisma.Decimal(0),
        grossProfit: new Prisma.Decimal(0),
      };
      current.unitLabel ??= item.unitLabel;
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
  const divisor = product.quantityUnit === "GRAM" || product.quantityUnit === "MILLILITER" ? 1_000 : 1;
  return {
    productId: product.productId,
    productVariantId: product.productVariantId,
    productName: product.productName,
    variantName: product.variantName,
    sku: product.sku,
    quantity: product.quantity / divisor,
    quantityUnit: product.quantityUnit === "GRAM" ? "KG" : product.quantityUnit === "MILLILITER" ? "LITER" : "PIECE",
    unitLabel: product.unitLabel,
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
  physicalSaleReturns?: AnalyticsPhysicalSaleReturnRecord[];
  inventoryOperations?: AnalyticsInventoryOperationRecord[];
  openCodOrders: Array<{ status: "PENDING" | "CONFIRMED" | "PROCESSING" }>;
  stockBatches: AnalyticsStockBatchRecord[];
  variants: AnalyticsVariantRecord[];
}) {
  const now = input.now ?? new Date();
  const range = resolveAnalyticsRange(input.query, now);
  const physicalSaleReturns = input.physicalSaleReturns ?? [];
  const inventoryOperations = input.inventoryOperations ?? [];
  const currentEvents = eventsForPeriod(input.orders, physicalSaleReturns, inventoryOperations, range.current);
  const previousEvents = eventsForPeriod(input.orders, physicalSaleReturns, inventoryOperations, range.previous);
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

  const trendGranularity: TrendGranularity = inclusiveDays(range.current.from, range.current.to) > 62
    ? "MONTH"
    : "DAY";
  const currentTrend = trendForPeriod(range.current, currentEvents, trendGranularity);
  const previousTrend = trendForPeriod(range.previous, previousEvents, trendGranularity);

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
    .sort((a, b) => b.productRevenue.comparedTo(a.productRevenue))
    .slice(0, 10)
    .map(productDto);
  const mostProfitable = [...products]
    .sort((a, b) => b.grossProfit.comparedTo(a.grossProfit))
    .slice(0, 10)
    .map(productDto);

  const inventory = input.stockBatches.reduce((totals, batch) => {
    const onHand = batch.availableQuantity + batch.reservedQuantity;
    const kind = batch.productVariant?.product?.kind ?? "PACKAGED";
    const unit = kind === "PACKAGED" || kind === "EGG"
      ? "pieces"
      : kind === "LOOSE_WEIGHT" ? "grams" : "milliliters";
    totals.available[unit] += batch.availableQuantity;
    totals.reserved[unit] += batch.reservedQuantity;
    totals.onHand[unit] += onHand;
    totals.valuation = totals.valuation.plus(quantityCost(batch.unitBuyingCost.toString(), onHand, kind));
    return totals;
  }, {
    available: emptyQuantities(),
    reserved: emptyQuantities(),
    onHand: emptyQuantities(),
    valuation: new Prisma.Decimal(0),
  });
  const stockVariantDto = (variant: AnalyticsVariantRecord) => {
    const kind = variant.product.kind ?? "PACKAGED";
    const divisor = kind === "LOOSE_WEIGHT" || kind === "LOOSE_VOLUME" ? 1_000 : 1;
    const quantityUnit = kind === "LOOSE_WEIGHT" ? "KG" : kind === "LOOSE_VOLUME" ? "LITER" : "PIECE";
    return ({
    productVariantId: variant.id,
    productName: variant.product.name,
    variantName: variant.name,
    sku: variant.sku,
    productKind: kind,
    unitLabel: variant.unitLabel,
    quantityUnit,
    availableStock: variant.availableStock / divisor,
    reservedStock: variant.reservedStock / divisor,
    onHandStock: (variant.availableStock + variant.reservedStock) / divisor,
    lowStockThreshold: variant.lowStockThreshold / divisor,
  }); };
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
      cashProductRevenue: compared(current.cashProductRevenue, previous.cashProductRevenue),
      creditProductRevenue: compared(current.creditProductRevenue, previous.creditProductRevenue),
      deliveryCharges: compared(current.deliveryCharges, previous.deliveryCharges),
      grossProfit: compared(current.grossProfit, previous.grossProfit),
      grossMargin: compared(currentMargin, previousMargin, 2),
      recognizedOrderCount: compared(decimal(current.orderCount), decimal(previous.orderCount), 0),
      soldQuantities: {
        pieces: compared(decimal(current.quantities.pieces), decimal(previous.quantities.pieces), 0),
        weightKg: compared(decimal(current.quantities.grams).div(1_000), decimal(previous.quantities.grams).div(1_000), 3),
        volumeLitres: compared(decimal(current.quantities.milliliters).div(1_000), decimal(previous.quantities.milliliters).div(1_000), 3),
      },
      averageOrderValue: compared(currentAverage, previousAverage),
      pendingCodOrderCount: pendingCod.total,
      lowStockVariantCount: lowStock.length,
      outOfStockVariantCount: outOfStock.length,
    },
    trendGranularity,
    trend: currentTrend.map((point, index) => ({
      current: trendBucketDto(point),
      previous: previousTrend[index] ? trendBucketDto(previousTrend[index]) : null,
    })),
    salesBySource: [...sourceMap.values()].map((source) => ({
      source: source.source,
      orderCount: source.orderCount,
      recognizedSales: decimalNumber(source.recognizedSales),
    })),
    bestSelling,
    mostProfitable,
    inventory: {
      availableQuantities: { pieces: inventory.available.pieces, weightKg: inventory.available.grams / 1_000, volumeLitres: inventory.available.milliliters / 1_000 },
      reservedQuantities: { pieces: inventory.reserved.pieces, weightKg: inventory.reserved.grams / 1_000, volumeLitres: inventory.reserved.milliliters / 1_000 },
      onHandQuantities: { pieces: inventory.onHand.pieces, weightKg: inventory.onHand.grams / 1_000, volumeLitres: inventory.onHand.milliliters / 1_000 },
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
      const dateStart = new Date(`${range.current.from}T00:00:00.000Z`);
      const dateEnd = new Date(`${addDays(range.current.to, 1)}T00:00:00.000Z`);
      const inventoryOperationsPromise = prisma.inventoryOperation?.findMany
        ? prisma.inventoryOperation.findMany({
          where: { effectiveDate: { gte: earliest, lt: latest } },
          select: {
            type: true,
            effectiveDate: true,
            recognizedCostImpact: true,
            stockLossAmount: true,
            productVariant: { select: { id: true, name: true, sku: true, unitLabel: true, product: { select: { id: true, name: true, kind: true } } } },
          },
        })
        : Promise.resolve([]);
      const [orders, physicalSaleReturns, openCodOrders, stockBatches, variants, inventoryOperations, paidShopSales, customerPayments, legacyPayments, payouts, currentExpenses, previousExpenses] = await Promise.all([
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
            paymentMethod: true,
            subtotal: true,
            discountTotal: true,
            priceIncreaseTotal: true,
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
                quantityUnit: true,
                unitLabelSnapshot: true,
                netLineRevenue: true,
                totalBuyingCost: true,
                allocations: { select: { totalBuyingCost: true } },
              },
            },
          },
        }),
        prisma.physicalSaleReturn.findMany({
          where: { createdAt: { gte: earliest, lt: latest } },
          select: {
            createdAt: true,
            refundAmount: true,
            reversedBuyingCost: true,
            reversedGrossProfit: true,
            salesOrder: { select: { paymentMethod: true } },
            items: {
              select: {
                quantity: true,
                refundAmount: true,
                reversedBuyingCost: true,
                reversedGrossProfit: true,
                salesOrderItem: {
                  select: {
                    productId: true,
                    productVariantId: true,
                    productNameSnapshot: true,
                    variantNameSnapshot: true,
                    skuSnapshot: true,
                    quantityUnit: true,
                    unitLabelSnapshot: true,
                  },
                },
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
          select: {
            availableQuantity: true,
            reservedQuantity: true,
            unitBuyingCost: true,
            productVariant: { select: { product: { select: { kind: true } } } },
          },
        }),
        prisma.productVariant.findMany({
          where: { isActive: true, product: { isActive: true } },
          select: {
            id: true,
            name: true,
            sku: true,
            unitLabel: true,
            availableStock: true,
            reservedStock: true,
            lowStockThreshold: true,
            product: { select: { name: true, kind: true } },
          },
        }),
        inventoryOperationsPromise,
        prisma.salesOrder.findMany({
          where: {
            source: "PHYSICAL_SHOP",
            paymentMethod: "CASH",
            status: { in: [...PHYSICAL_STATUSES] },
            OR: [
              { soldOn: { gte: dateStart, lt: dateEnd } },
              { soldOn: null, completedAt: { gte: range.current.startUtc, lt: range.current.endUtc } },
            ],
          },
          select: { grandTotal: true, paymentChannel: true },
        }),
        prisma.creditCustomerPayment.findMany({
          where: { voidedAt: null, paidOn: { gte: dateStart, lt: dateEnd } },
          select: { amount: true, paymentChannel: true },
        }),
        prisma.creditPayment.findMany({
          where: { voidedAt: null, paidOn: { gte: dateStart, lt: dateEnd } },
          select: { amount: true, paymentChannel: true },
        }),
        prisma.physicalSaleReturn.findMany({
          where: { createdAt: { gte: range.current.startUtc, lt: range.current.endUtc }, cashRefundAmount: { gt: 0 } },
          select: { cashRefundAmount: true, refundChannel: true },
        }),
        prisma.shopExpense?.aggregate({ where: { voidedAt: null, paidOn: { gte: dateStart, lt: dateEnd } }, _sum: { amount: true } }) ?? Promise.resolve({ _sum: { amount: null } }),
        prisma.shopExpense?.aggregate({ where: { voidedAt: null, paidOn: { gte: new Date(`${range.previous.from}T00:00:00.000Z`), lt: new Date(`${addDays(range.previous.to, 1)}T00:00:00.000Z`) } }, _sum: { amount: true } }) ?? Promise.resolve({ _sum: { amount: null } }),
      ]);

      const paymentChannels = summarizePaymentChannels({ paidShopSales, customerPayments, legacyPayments, payouts });

      const base = buildAnalyticsDashboard({
        query,
        now,
        orders: orders as AnalyticsOrderRecord[],
        physicalSaleReturns: physicalSaleReturns as AnalyticsPhysicalSaleReturnRecord[],
        inventoryOperations: inventoryOperations as AnalyticsInventoryOperationRecord[],
        openCodOrders: openCodOrders as Array<{ status: "PENDING" | "CONFIRMED" | "PROCESSING" }>,
        stockBatches,
        variants,
      });
      const expenseCurrent = decimal(currentExpenses._sum.amount);
      const expensePrevious = decimal(previousExpenses._sum.amount);
      const stockLossFor = (from: string, to: string) => inventoryOperations.reduce((sum, operation) => {
        const date = operation.effectiveDate.toISOString().slice(0, 10);
        return (operation.type === "STOCK_LOSS" || operation.type === "STOCK_RECONCILIATION") && date >= from && date <= to
          ? sum.plus(decimal(operation.stockLossAmount))
          : sum;
      }, new Prisma.Decimal(0));
      return {
        ...base, paymentChannels,
        expenseSummary: {
          total: compared(expenseCurrent, expensePrevious),
          stockLoss: compared(stockLossFor(range.current.from, range.current.to), stockLossFor(range.previous.from, range.previous.to)),
          profitAfterExpenses: compared(decimal(base.summary.grossProfit.value).minus(expenseCurrent), decimal(base.summary.grossProfit.previousValue).minus(expensePrevious)),
        },
      };
    },
  };
}

export type AnalyticsService = ReturnType<typeof createAnalyticsService>;
