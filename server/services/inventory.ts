import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PaymentChannel, type PrismaClient } from "../generated/prisma/client.js";
import type {
  CreditCustomerList,
  CreditCustomerSuggestion,
  CreditCustomerUpdate,
  CreditFollowUp,
  CreditPaymentCreate,
  CreditPaymentVoid,
  CreditSaleList,
  PhysicalSaleCreate,
  PhysicalSaleList,
  PhysicalSaleReturnInput,
  InventoryItemBatchList,
  InventoryItemList,
  InventoryRecordList,
  PurchaseCreate,
  StockAdjustmentInput,
  StockLossInput,
  StockReconciliationInput,
  StockBatchCorrectionInput,
  StockBatchList,
} from "../schemas/inventory.js";
import { consumeAvailableFifo, type FifoAllocation } from "./stockAllocation.js";
import { quantityCost, quantityUnitForKind, toBaseQuantity, unitLabelForKind } from "../lib/quantity.js";
import { isTransactionTimeout, SERIALIZABLE_TRANSACTION_OPTIONS } from "../lib/transactions.js";
import { sellingPriceForQuantity } from "../lib/pricing.js";
import { allocateSaleAmount } from "../lib/saleAdjustment.js";

interface InventoryHttpError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;
}

function inventoryError(
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): InventoryHttpError {
  return Object.assign(new Error(message), { status, code, details });
}

function rethrowInventoryTransactionError(error: unknown): never {
  if (error && typeof error === "object" && (error as { code?: unknown }).code === "P2034") {
    throw inventoryError(409, "STOCK_CONFLICT", "Stock changed concurrently. Please retry the operation.");
  }
  if (isTransactionTimeout(error)) {
    throw inventoryError(503, "TRANSACTION_TIMEOUT", "The database took too long. No changes were saved. Please try again.");
  }
  throw error;
}

const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const asMoney = (value: string | number | Prisma.Decimal) => new Prisma.Decimal(value);
const moneyNumber = (value: Prisma.Decimal | null) => value === null ? null : Number(value);

const saleInclude = {
  createdBy: { select: { fullName: true, role: true } },
  creditCustomer: { select: { id: true, name: true, phone: true, nextFollowUpDate: true } },
  creditPayments: {
    orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }],
    include: {
      createdBy: { select: { fullName: true, role: true } },
      voidedBy: { select: { fullName: true, role: true } },
    },
  },
  creditPaymentAllocations: {
    orderBy: { createdAt: "asc" },
    include: {
      creditPayment: {
        include: {
          createdBy: { select: { fullName: true, role: true } },
          voidedBy: { select: { fullName: true, role: true } },
        },
      },
    },
  },
  physicalSaleReturns: {
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { fullName: true, role: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          salesOrderItem: {
            select: {
              productNameSnapshot: true,
              variantNameSnapshot: true,
              quantityUnit: true,
              unitLabelSnapshot: true,
            },
          },
        },
      },
    },
  },
  items: {
    orderBy: { createdAt: "asc" },
    include: {
      physicalSaleReturnItems: {
        select: { quantity: true, refundAmount: true, reversedBuyingCost: true },
      },
      allocations: {
        orderBy: { createdAt: "asc" },
        include: { stockBatch: { select: { purchaseDate: true } } },
      },
    },
  },
} satisfies Prisma.SalesOrderInclude;

type SaleRecord = Prisma.SalesOrderGetPayload<{ include: typeof saleInclude }>;

function saleDto(sale: SaleRecord) {
  const refundedAmount = sale.physicalSaleReturns.reduce(
    (total, value) => total.plus(value.refundAmount),
    new Prisma.Decimal(0),
  );
  const reversedBuyingCost = sale.physicalSaleReturns.reduce(
    (total, value) => total.plus(value.reversedBuyingCost),
    new Prisma.Decimal(0),
  );
  const reversedGrossProfit = sale.physicalSaleReturns.reduce(
    (total, value) => total.plus(value.reversedGrossProfit),
    new Prisma.Decimal(0),
  );
  const legacyCreditPayments = sale.creditPayments ?? [];
  const allocatedCreditPayments = (sale.creditPaymentAllocations ?? [])
    .filter(({ creditPayment }) => !creditPayment.voidedAt)
    .map(({ amount, creditPayment }) => ({ ...creditPayment, amount }));
  const creditPayments = [...legacyCreditPayments, ...allocatedCreditPayments];
  const collectedAmount = creditPayments.reduce(
    (total, payment) => payment.voidedAt ? total : total.plus(payment.amount),
    new Prisma.Decimal(0),
  );
  const remainingRevenue = Prisma.Decimal.max(asMoney(sale.grandTotal).minus(refundedAmount), 0);
  const outstandingAmount = Prisma.Decimal.max(remainingRevenue.minus(collectedAmount), 0);
  return {
    id: sale.id,
    orderNumber: sale.orderNumber,
    source: sale.source,
    status: sale.status,
    paymentMethod: sale.paymentMethod,
    paymentChannel: sale.paymentChannel,
    paymentStatus: sale.paymentStatus,
    creditCustomerId: sale.creditCustomerId,
    nextFollowUpDate: (sale.creditCustomer?.nextFollowUpDate ?? sale.nextFollowUpDate)?.toISOString().slice(0, 10) ?? null,
    customerName: sale.creditCustomer?.name ?? sale.customerName,
    customerPhone: sale.creditCustomer?.phone ?? sale.customerPhone,
    subtotal: moneyNumber(sale.subtotal),
    discountTotal: moneyNumber(sale.discountTotal),
    priceIncreaseTotal: moneyNumber(sale.priceIncreaseTotal),
    grandTotal: moneyNumber(sale.grandTotal),
    totalBuyingCost: moneyNumber(sale.totalBuyingCost),
    grossProfit: moneyNumber(sale.grossProfit),
    grossProfitMargin: moneyNumber(sale.grossProfitMargin),
    refundedAmount: Number(refundedAmount),
    remainingRevenue: Number(remainingRevenue),
    collectedAmount: Number(collectedAmount),
    outstandingAmount: Number(outstandingAmount),
    remainingBuyingCost: sale.totalBuyingCost === null ? null : Number(asMoney(sale.totalBuyingCost).minus(reversedBuyingCost)),
    remainingGrossProfit: sale.grossProfit === null ? null : Number(asMoney(sale.grossProfit).minus(reversedGrossProfit)),
    unprofitableOverrideConfirmed: sale.unprofitableOverrideConfirmed,
    createdBy: sale.createdBy,
    completedAt: sale.completedAt,
    soldOn: sale.soldOn?.toISOString().slice(0, 10) ?? dhakaDateOnly(sale.completedAt ?? sale.createdAt),
    items: sale.items.map((item) => {
      const returnedQuantity = item.physicalSaleReturnItems.reduce((total, value) => total + value.quantity, 0);
      return ({
      id: item.id,
      productId: item.productId,
      productVariantId: item.productVariantId,
      productName: item.productNameSnapshot,
      variantName: item.variantNameSnapshot,
      quantityUnit: item.quantityUnit,
      unitLabel: item.unitLabelSnapshot,
      sku: item.skuSnapshot,
      quantity: item.quantity,
      unitSellingPrice: moneyNumber(item.unitSellingPrice),
      sellingPriceTier: item.sellingPriceTier,
      grossLineRevenue: moneyNumber(item.grossLineRevenue),
      allocatedDiscount: moneyNumber(item.allocatedDiscount),
      allocatedPriceIncrease: moneyNumber(item.allocatedPriceIncrease),
      netLineRevenue: moneyNumber(item.netLineRevenue),
      totalBuyingCost: moneyNumber(item.totalBuyingCost),
      grossProfit: moneyNumber(item.grossProfit),
      returnedQuantity,
      returnableQuantity: item.quantity - returnedQuantity,
      allocations: item.allocations.map((allocation) => ({
        id: allocation.id,
        stockBatchId: allocation.stockBatchId,
        quantity: allocation.quantity,
        unitBuyingCost: moneyNumber(allocation.unitBuyingCost),
        totalBuyingCost: moneyNumber(allocation.totalBuyingCost),
        state: allocation.state,
        purchaseDate: allocation.stockBatch.purchaseDate,
      })),
    }); }),
    returns: sale.physicalSaleReturns.map((value) => ({
      id: value.id,
      condition: value.condition,
      reason: value.reason,
      refundAmount: Number(value.refundAmount),
      creditOffsetAmount: Number(value.creditOffsetAmount ?? 0),
      cashRefundAmount: Number(value.cashRefundAmount ?? value.refundAmount),
      refundChannel: value.refundChannel ?? (Number(value.cashRefundAmount ?? value.refundAmount) > 0 ? "CASH" : null),
      reversedBuyingCost: Number(value.reversedBuyingCost),
      reversedGrossProfit: Number(value.reversedGrossProfit),
      createdBy: value.createdBy,
      createdAt: value.createdAt,
      items: value.items.map((item) => ({
        id: item.id,
        salesOrderItemId: item.salesOrderItemId,
        productName: item.salesOrderItem.productNameSnapshot,
        variantName: item.salesOrderItem.variantNameSnapshot,
        quantityUnit: item.salesOrderItem.quantityUnit,
        unitLabel: item.salesOrderItem.unitLabelSnapshot,
        quantity: item.quantity,
        refundAmount: Number(item.refundAmount),
        reversedBuyingCost: Number(item.reversedBuyingCost),
        reversedGrossProfit: Number(item.reversedGrossProfit),
      })),
    })),
    creditPayments: creditPayments.map((payment) => ({
      id: payment.id,
      amount: Number(payment.amount),
      paidOn: payment.paidOn.toISOString().slice(0, 10),
      paymentChannel: payment.paymentChannel ?? "CASH",
      note: payment.note,
      createdBy: payment.createdBy,
      createdAt: payment.createdAt,
      voidedAt: payment.voidedAt,
      voidReason: payment.voidReason,
      voidedBy: payment.voidedBy,
    })),
  };
}

function nextDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function kindForQuantityUnit(unit: "PIECE" | "GRAM" | "MILLILITER") {
  if (unit === "GRAM") return "LOOSE_WEIGHT" as const;
  if (unit === "MILLILITER") return "LOOSE_VOLUME" as const;
  return "PACKAGED" as const;
}

function proportionalMoney(
  originalTotal: Prisma.Decimal,
  requestedQuantity: number,
  originalQuantity: number,
  alreadyReversed: Prisma.Decimal,
  remainingQuantity: number,
) {
  if (requestedQuantity === remainingQuantity) return originalTotal.minus(alreadyReversed);
  return originalTotal
    .mul(requestedQuantity)
    .div(originalQuantity)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function dhakaDateOnly(now = new Date()) {
  return new Date(now.getTime() + 6 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

function cleanCreditCustomerName(value: string) {
  return value.trim().replace(/\s+/gu, " ").normalize("NFKC");
}

function normalizeCreditCustomerName(value: string) {
  return cleanCreditCustomerName(value).toLocaleLowerCase("bn-BD");
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function activeCreditTotal(sale: {
  grandTotal: Prisma.Decimal;
  physicalSaleReturns?: Array<{ refundAmount: Prisma.Decimal }>;
  creditPayments?: Array<{ amount: Prisma.Decimal; voidedAt: Date | null }>;
}) {
  const returned = (sale.physicalSaleReturns ?? []).reduce((total, value) => total.plus(value.refundAmount), new Prisma.Decimal(0));
  const collected = (sale.creditPayments ?? []).reduce(
    (total, value) => value.voidedAt ? total : total.plus(value.amount),
    new Prisma.Decimal(0),
  );
  const currentSaleValue = Prisma.Decimal.max(sale.grandTotal.minus(returned), 0);
  return {
    currentSaleValue,
    collected,
    outstanding: Prisma.Decimal.max(currentSaleValue.minus(collected), 0),
  };
}

function creditPaymentStatus(collected: Prisma.Decimal, outstanding: Prisma.Decimal) {
  if (outstanding.isZero()) return "PAID" as const;
  return collected.isZero() ? "UNPAID" as const : "PARTIALLY_PAID" as const;
}


function purchaseBatchDto(batch: Prisma.StockBatchGetPayload<{
  include: {
    productVariant: { include: { product: { select: { name: true; kind: true } } } };
    createdBy: { select: { fullName: true; role: true } };
  };
}>) {
  return {
    id: batch.id,
    purchaseGroupId: batch.purchaseGroupId,
    productVariantId: batch.productVariantId,
    productName: batch.productVariant.product.name,
    variantName: batch.productVariant.name,
    productKind: batch.productVariant.product.kind,
    quantityUnit: quantityUnitForKind(batch.productVariant.product.kind),
    unitLabel: unitLabelForKind(batch.productVariant.product.kind, batch.productVariant.unitLabel),
    sku: batch.productVariant.sku,
    source: batch.source,
    purchasedQuantity: batch.purchasedQuantity,
    availableQuantity: batch.availableQuantity,
    reservedQuantity: batch.reservedQuantity,
    unitBuyingCost: moneyNumber(batch.unitBuyingCost),
    purchaseDate: batch.purchaseDate,
    note: batch.note,
    adjustmentReason: batch.adjustmentReason,
    variantAvailableStock: batch.productVariant.availableStock,
    variantReservedStock: batch.productVariant.reservedStock,
    createdBy: batch.createdBy,
    createdAt: batch.createdAt,
  };
}

export function createInventoryService(prisma: PrismaClient) {
  const fullBatchInclude = {
    productVariant: { include: { product: { select: { name: true, kind: true } } } },
    createdBy: { select: { fullName: true, role: true } },
  } satisfies Prisma.StockBatchInclude;

  const creditCustomerBalanceInclude = {
    createdBy: { select: { fullName: true, role: true } },
    sales: {
      where: { source: "PHYSICAL_SHOP", paymentMethod: "CREDIT" },
      orderBy: [{ completedAt: "asc" }, { createdAt: "asc" }],
      include: {
        physicalSaleReturns: { select: { refundAmount: true, cashRefundAmount: true } },
        creditPaymentAllocations: {
          include: { creditPayment: { select: { voidedAt: true } } },
        },
      },
    },
    payments: {
      orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }],
      include: {
        createdBy: { select: { fullName: true, role: true } },
        voidedBy: { select: { fullName: true, role: true } },
        allocations: { select: { salesOrderId: true, amount: true } },
      },
    },
  } satisfies Prisma.CreditCustomerInclude;

  type CreditCustomerBalanceRecord = Prisma.CreditCustomerGetPayload<{
    include: typeof creditCustomerBalanceInclude;
  }>;

  function customerBalance(customer: CreditCustomerBalanceRecord) {
    const currentSalesTotal = customer.sales.reduce((total, sale) => {
      const returned = sale.physicalSaleReturns.reduce((sum, value) => sum.plus(value.refundAmount), new Prisma.Decimal(0));
      return total.plus(Prisma.Decimal.max(sale.grandTotal.minus(returned), 0));
    }, new Prisma.Decimal(0));
    const cashRefunded = customer.sales.reduce((total, sale) => total.plus(
      sale.physicalSaleReturns.reduce((sum, value) => sum.plus(value.cashRefundAmount), new Prisma.Decimal(0)),
    ), new Prisma.Decimal(0));
    const grossPayments = customer.payments.reduce(
      (total, payment) => payment.voidedAt ? total : total.plus(payment.amount),
      new Prisma.Decimal(0),
    );
    const netCollected = grossPayments.minus(cashRefunded);
    const collected = Prisma.Decimal.max(netCollected, 0);
    return {
      currentSalesTotal,
      grossPayments,
      cashRefunded,
      collected,
      outstanding: Prisma.Decimal.max(currentSalesTotal.minus(netCollected), 0),
    };
  }

  function creditCustomerDto(customer: CreditCustomerBalanceRecord) {
    const balance = customerBalance(customer);
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      nextFollowUpDate: customer.nextFollowUpDate?.toISOString().slice(0, 10) ?? null,
      totalSaleAmount: Number(balance.currentSalesTotal),
      collectedAmount: Number(balance.collected),
      outstandingAmount: Number(balance.outstanding),
      saleCount: customer.sales.length,
      createdBy: customer.createdBy,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      payments: customer.payments.map((payment) => ({
        id: payment.id,
        amount: Number(payment.amount),
        paidOn: payment.paidOn.toISOString().slice(0, 10),
        paymentChannel: payment.paymentChannel ?? "CASH",
        note: payment.note,
        createdBy: payment.createdBy,
        createdAt: payment.createdAt,
        voidedAt: payment.voidedAt,
        voidReason: payment.voidReason,
        voidedBy: payment.voidedBy,
        allocations: payment.allocations.map((allocation) => ({
          salesOrderId: allocation.salesOrderId,
          amount: Number(allocation.amount),
        })),
      })),
    };
  }

  async function readCreditCustomer(id: string, client: PrismaClient | Prisma.TransactionClient = prisma) {
    const customer = await client.creditCustomer.findUnique({
      where: { id },
      include: creditCustomerBalanceInclude,
    });
    if (!customer) throw inventoryError(404, "CREDIT_CUSTOMER_NOT_FOUND", "Credit customer not found.");
    return customer;
  }

  async function lockCreditCustomer(transaction: Prisma.TransactionClient, id: string) {
    const locked = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "credit_customers" WHERE "id" = ${id}::uuid FOR UPDATE
    `);
    if (locked.length === 0) throw inventoryError(404, "CREDIT_CUSTOMER_NOT_FOUND", "Credit customer not found.");
  }

  async function rebuildCustomerPaymentAllocations(transaction: Prisma.TransactionClient, customerId: string) {
    const customer = await readCreditCustomer(customerId, transaction);
    const balance = customerBalance(customer);
    const activePayments = customer.payments.filter((payment) => !payment.voidedAt);
    await transaction.creditCustomerPaymentAllocation.deleteMany({
      where: { creditPayment: { creditCustomerId: customerId } },
    });

    const saleRemaining = new Map<string, Prisma.Decimal>();
    for (const sale of customer.sales) {
      const returned = sale.physicalSaleReturns.reduce((sum, value) => sum.plus(value.refundAmount), new Prisma.Decimal(0));
      saleRemaining.set(sale.id, Prisma.Decimal.max(sale.grandTotal.minus(returned), 0));
    }

    let allocationBudget = balance.collected;
    for (const payment of activePayments) {
      let paymentRemaining = Prisma.Decimal.min(payment.amount, allocationBudget);
      for (const sale of customer.sales) {
        if (paymentRemaining.lte(0)) break;
        const remaining = saleRemaining.get(sale.id) ?? new Prisma.Decimal(0);
        if (remaining.lte(0)) continue;
        const allocated = Prisma.Decimal.min(paymentRemaining, remaining);
        await transaction.creditCustomerPaymentAllocation.create({ data: {
          creditPaymentId: payment.id,
          salesOrderId: sale.id,
          amount: allocated,
        } });
        saleRemaining.set(sale.id, remaining.minus(allocated));
        paymentRemaining = paymentRemaining.minus(allocated);
        allocationBudget = allocationBudget.minus(allocated);
      }
      if (allocationBudget.lte(0)) break;
    }

    for (const sale of customer.sales) {
      const outstanding = saleRemaining.get(sale.id) ?? new Prisma.Decimal(0);
      const returned = sale.physicalSaleReturns.reduce((sum, value) => sum.plus(value.refundAmount), new Prisma.Decimal(0));
      const currentValue = Prisma.Decimal.max(sale.grandTotal.minus(returned), 0);
      const collected = currentValue.minus(outstanding);
      await transaction.salesOrder.update({
        where: { id: sale.id },
        data: {
          paymentStatus: creditPaymentStatus(collected, outstanding),
          nextFollowUpDate: outstanding.gt(0) ? customer.nextFollowUpDate : null,
        },
      });
    }

    if (balance.outstanding.isZero() && customer.nextFollowUpDate) {
      await transaction.creditCustomer.update({ where: { id: customerId }, data: { nextFollowUpDate: null } });
    }
    return balance;
  }

  async function readSale(id: string) {
    const sale = await prisma.salesOrder.findUnique({ where: { id }, include: saleInclude });
    if (!sale) throw inventoryError(404, "PHYSICAL_SALE_NOT_FOUND", "Physical sale not found.");
    return saleDto(sale);
  }

  async function listBatches(input: StockBatchList) {
    const batches = await prisma.stockBatch.findMany({
      where: input.productVariantId ? { productVariantId: input.productVariantId } : undefined,
      include: fullBatchInclude,
      orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
      take: input.limit,
    });
    return batches.map(purchaseBatchDto);
  }

  function operationalStatus(variant: {
    isActive: boolean;
    availableStock: number;
    lowStockThreshold: number;
    product: { isActive: boolean; category: { isActive: boolean } };
  }) {
    if (!variant.isActive || !variant.product.isActive || !variant.product.category.isActive) return "INACTIVE" as const;
    if (variant.availableStock === 0) return "OUT_OF_STOCK" as const;
    if (variant.availableStock <= variant.lowStockThreshold) return "LOW_STOCK" as const;
    return "IN_STOCK" as const;
  }

  async function getInventorySummary() {
    const [variants, batches] = await Promise.all([
      prisma.productVariant.findMany({
        select: {
          isActive: true,
          availableStock: true,
          lowStockThreshold: true,
          product: { select: { isActive: true, category: { select: { isActive: true } } } },
        },
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
    ]);
    const statuses = variants.map(operationalStatus);
    const inventoryValue = batches.reduce((total, batch) => total.plus(quantityCost(
      batch.unitBuyingCost,
      batch.availableQuantity + batch.reservedQuantity,
      batch.productVariant.product.kind,
    )), new Prisma.Decimal(0));
    return {
      totalStockItems: variants.length,
      lowStockItems: statuses.filter((status) => status === "LOW_STOCK").length,
      outOfStockItems: statuses.filter((status) => status === "OUT_OF_STOCK").length,
      inventoryValue: moneyNumber(inventoryValue),
    };
  }

  async function listInventoryItems(input: InventoryItemList) {
    const variants = await prisma.productVariant.findMany({
      select: {
        id: true,
        productId: true,
        name: true,
        unitLabel: true,
        availableStock: true,
        reservedStock: true,
        lowStockThreshold: true,
        isActive: true,
        product: {
          select: {
            name: true,
            kind: true,
            isActive: true,
            category: { select: { id: true, name: true, isActive: true } },
          },
        },
        stockBatches: {
          orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: { purchaseDate: true },
        },
      },
    });
    const normalizedQuery = input.query?.toLocaleLowerCase("bn-BD");
    const rows = variants.map((variant) => ({
      productVariantId: variant.id,
      productId: variant.productId,
      productName: variant.product.name,
      variantName: variant.name,
      productKind: variant.product.kind,
      quantityUnit: quantityUnitForKind(variant.product.kind),
      unitLabel: unitLabelForKind(variant.product.kind, variant.unitLabel),
      categoryId: variant.product.category.id,
      categoryName: variant.product.category.name,
      availableStock: variant.availableStock,
      reservedStock: variant.reservedStock,
      lowStockThreshold: variant.lowStockThreshold,
      isOperational: operationalStatus(variant) !== "INACTIVE",
      status: operationalStatus(variant),
      lastStockAddedAt: variant.stockBatches[0]?.purchaseDate.toISOString().slice(0, 10) ?? null,
    })).filter((row) => (
      (!normalizedQuery || `${row.productName} ${row.variantName}`.toLocaleLowerCase("bn-BD").includes(normalizedQuery))
      && (!input.categoryId || row.categoryId === input.categoryId)
      && (input.status === "ALL" || row.status === input.status)
    ));
    rows.sort((left, right) => {
      if (input.sort === "NAME") return `${left.productName} ${left.variantName}`.localeCompare(`${right.productName} ${right.variantName}`, "bn-BD");
      if (input.sort === "STOCK_ASC") return left.availableStock - right.availableStock
        || `${left.productName} ${left.variantName}`.localeCompare(`${right.productName} ${right.variantName}`, "bn-BD");
      if (input.sort === "LAST_ADDED") return (right.lastStockAddedAt ?? "").localeCompare(left.lastStockAddedAt ?? "")
        || `${left.productName} ${left.variantName}`.localeCompare(`${right.productName} ${right.variantName}`, "bn-BD");
      const rank = { OUT_OF_STOCK: 0, LOW_STOCK: 1, IN_STOCK: 2, INACTIVE: 3 } as const;
      return rank[left.status] - rank[right.status]
        || `${left.productName} ${left.variantName}`.localeCompare(`${right.productName} ${right.variantName}`, "bn-BD");
    });
    const start = (input.page - 1) * input.limit;
    return {
      data: rows.slice(start, start + input.limit),
      total: rows.length,
      page: input.page,
      limit: input.limit,
      totalPages: Math.ceil(rows.length / input.limit),
    };
  }

  async function listInventoryItemBatches(productVariantId: string, input: InventoryItemBatchList) {
    const where: Prisma.StockBatchWhereInput = {
      productVariantId,
      ...(!input.includeDepleted ? { OR: [{ availableQuantity: { gt: 0 } }, { reservedQuantity: { gt: 0 } }] } : {}),
    };
    const [exists, batches, total, allTotal] = await Promise.all([
      prisma.productVariant.findUnique({ where: { id: productVariantId }, select: { id: true } }),
      prisma.stockBatch.findMany({
        where,
        include: fullBatchInclude,
        orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      }),
      prisma.stockBatch.count({ where }),
      prisma.stockBatch.count({ where: { productVariantId } }),
    ]);
    if (!exists) throw inventoryError(404, "INVENTORY_ITEM_NOT_FOUND", "Inventory item not found.");
    return {
      data: batches.map(purchaseBatchDto),
      total,
      page: input.page,
      limit: input.limit,
      totalPages: Math.ceil(total / input.limit),
      hasDepleted: allTotal > total,
    };
  }

  async function listInventoryRecords(input: InventoryRecordList) {
    const [purchaseBatches, adjustments, operations] = await Promise.all([
      input.type === "ADJUSTMENT" || ["STOCK_LOSS", "ENTRY_CORRECTION", "STOCK_RECONCILIATION"].includes(input.type) ? Promise.resolve([]) : prisma.stockBatch.findMany({
        where: { source: "PURCHASE" },
        include: fullBatchInclude,
        orderBy: [{ createdAt: "desc" }],
      }),
      input.type === "PURCHASE" || ["STOCK_LOSS", "ENTRY_CORRECTION", "STOCK_RECONCILIATION"].includes(input.type) ? Promise.resolve([]) : prisma.stockAdjustment.findMany({
        include: {
          productVariant: { include: { product: { select: { name: true, kind: true } } } },
          createdBy: { select: { fullName: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      (input.type === "PURCHASE" || input.type === "ADJUSTMENT") ? Promise.resolve([]) : prisma.inventoryOperation.findMany({
        include: {
          productVariant: { include: { product: { select: { name: true, kind: true } } } },
          createdBy: { select: { fullName: true, role: true } },
        },
        orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
      }),
    ]);
    const purchaseGroups = new Map<string, typeof purchaseBatches>();
    for (const batch of purchaseBatches) {
      const id = batch.purchaseGroupId ?? batch.id;
      const group = purchaseGroups.get(id) ?? [];
      group.push(batch);
      purchaseGroups.set(id, group);
    }
    const records = [
      ...[...purchaseGroups.entries()].map(([id, group]) => ({
        id,
        type: "PURCHASE" as const,
        occurredAt: group[0].createdAt.toISOString(),
        effectiveDate: group[0].purchaseDate.toISOString().slice(0, 10),
        note: group[0].note,
        createdBy: group[0].createdBy,
        items: group.map((batch) => ({
          batchId: batch.id,
          canCorrect: true,
          productVariantId: batch.productVariantId,
          productName: batch.productVariant.product.name,
          variantName: batch.productVariant.name,
          productKind: batch.productVariant.product.kind,
          quantityUnit: quantityUnitForKind(batch.productVariant.product.kind),
          unitLabel: unitLabelForKind(batch.productVariant.product.kind, batch.productVariant.unitLabel),
          direction: "INCREASE" as const,
          quantity: batch.purchasedQuantity,
          unitBuyingCost: moneyNumber(batch.unitBuyingCost),
        })),
      })),
      ...adjustments.map((adjustment) => ({
        id: adjustment.id,
        type: "ADJUSTMENT" as const,
        occurredAt: adjustment.createdAt.toISOString(),
        effectiveDate: adjustment.createdAt.toISOString(),
        note: adjustment.reason,
        createdBy: adjustment.createdBy,
        items: [{
          batchId: undefined,
          canCorrect: false,
          productVariantId: adjustment.productVariantId,
          productName: adjustment.productVariant.product.name,
          variantName: adjustment.productVariant.name,
          productKind: adjustment.productVariant.product.kind,
          quantityUnit: quantityUnitForKind(adjustment.productVariant.product.kind),
          unitLabel: unitLabelForKind(adjustment.productVariant.product.kind, adjustment.productVariant.unitLabel),
          direction: adjustment.direction,
          quantity: adjustment.quantity,
          unitBuyingCost: adjustment.unitBuyingCost ? moneyNumber(adjustment.unitBuyingCost) : null,
        }],
      })),
      ...operations.map((operation) => ({
        id: operation.id,
        type: operation.type,
        occurredAt: operation.createdAt.toISOString(),
        effectiveDate: operation.effectiveDate.toISOString().slice(0, 10),
        note: operation.note,
        createdBy: operation.createdBy,
        quantityDelta: operation.quantityDelta,
        inventoryValueImpact: moneyNumber(operation.inventoryValueImpact),
        stockLossAmount: moneyNumber(operation.stockLossAmount),
        recognizedCostImpact: moneyNumber(operation.recognizedCostImpact),
        availableBefore: operation.availableBefore,
        reservedBefore: operation.reservedBefore,
        onHandBefore: operation.onHandBefore,
        availableAfter: operation.availableAfter,
        reservedAfter: operation.reservedAfter,
        onHandAfter: operation.onHandAfter,
        actualPhysicalStock: operation.actualPhysicalStock,
        items: [{
          productVariantId: operation.productVariantId,
          productName: operation.productVariant.product.name,
          variantName: operation.productVariant.name,
          productKind: operation.productVariant.product.kind,
          quantityUnit: quantityUnitForKind(operation.productVariant.product.kind),
          unitLabel: unitLabelForKind(operation.productVariant.product.kind, operation.productVariant.unitLabel),
          direction: operation.quantityDelta < 0 ? "DECREASE" as const : "INCREASE" as const,
          quantity: Math.abs(operation.quantityDelta),
          unitBuyingCost: operation.newUnitBuyingCost ? moneyNumber(operation.newUnitBuyingCost) : null,
        }],
      })),
    ];
    const normalizedQuery = input.query?.toLocaleLowerCase("bn-BD");
    const filtered = records.filter((record) => !normalizedQuery || record.items.some((item) => (
      `${item.productName} ${item.variantName}`.toLocaleLowerCase("bn-BD").includes(normalizedQuery)
    ))).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    const start = (input.page - 1) * input.limit;
    return {
      data: filtered.slice(start, start + input.limit),
      total: filtered.length,
      page: input.page,
      limit: input.limit,
      totalPages: Math.ceil(filtered.length / input.limit),
    };
  }

  async function creditCustomerDetail(id: string) {
    const customer = await readCreditCustomer(id);
    const [sales, history] = await Promise.all([
      prisma.salesOrder.findMany({
        where: { creditCustomerId: id, source: "PHYSICAL_SHOP", paymentMethod: "CREDIT" },
        include: saleInclude,
        orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      }),
      prisma.auditLog.findMany({
        where: { entityType: "CREDIT_CUSTOMER", entityId: id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          action: true,
          previousData: true,
          newData: true,
          reason: true,
          createdAt: true,
          actor: { select: { fullName: true, role: true } },
        },
      }),
    ]);
    return { ...creditCustomerDto(customer), sales: sales.map(saleDto), history };
  }

  async function lockVariant(transaction: Prisma.TransactionClient, productVariantId: string) {
    const locked = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "product_variants" WHERE "id" = ${productVariantId}::uuid FOR UPDATE
    `);
    if (locked.length === 0) throw inventoryError(404, "VARIANT_NOT_FOUND", "The selected product was not found.");
    const variant = await transaction.productVariant.findUnique({
      where: { id: productVariantId },
      select: {
        id: true,
        isActive: true,
        availableStock: true,
        reservedStock: true,
        currentSellingPrice: true,
        product: { select: { name: true, kind: true, isActive: true, category: { select: { isActive: true } } } },
      },
    });
    if (!variant || !variant.isActive || !variant.product.isActive || variant.product.category?.isActive === false) {
      throw inventoryError(404, "ACTIVE_VARIANT_NOT_FOUND", "নির্বাচিত পণ্যটি ইনঅ্যাকটিভ অথবা পাওয়া যায়নি।");
    }
    return variant;
  }

  function baseQuantityAllowingZero(amountValue: string, amountUnit: "PIECE" | "KG" | "G" | "LITER" | "ML", kind: "PACKAGED" | "LOOSE_WEIGHT" | "LOOSE_VOLUME" | "EGG") {
    if (amountValue === "0" || /^0(?:\.0{1,3})?$/.test(amountValue)) return 0;
    return toBaseQuantity(amountValue, amountUnit, kind);
  }

  async function createInventoryOperationAllocation(
    transaction: Prisma.TransactionClient,
    operationId: string,
    allocations: FifoAllocation[],
  ) {
    if (allocations.length === 0) return;
    await transaction.inventoryOperationAllocation.createMany({
      data: allocations.map((allocation) => ({
        inventoryOperationId: operationId,
        stockBatchId: allocation.stockBatchId,
        quantity: allocation.quantity,
        unitBuyingCost: allocation.unitBuyingCost,
        totalBuyingCost: allocation.totalBuyingCost,
      })),
    });
  }

  async function createStockLoss(input: StockLossInput, actorId: string) {
    try {
      const operationId = await prisma.$transaction(async (transaction) => {
        const variant = await lockVariant(transaction, input.productVariantId);
        const quantity = toBaseQuantity(input.amount, input.amountUnit, variant.product.kind);
        const beforeAvailable = variant.availableStock;
        const beforeReserved = variant.reservedStock;
        const allocations = await consumeAvailableFifo(transaction, input.productVariantId, quantity, variant.product.kind);
        const operation = await transaction.inventoryOperation.create({ data: {
          productVariantId: input.productVariantId,
          type: "STOCK_LOSS",
          effectiveDate: asDate(dhakaDateOnly()),
          note: input.note,
          quantityDelta: -quantity,
          availableBefore: beforeAvailable,
          reservedBefore: beforeReserved,
          onHandBefore: beforeAvailable + beforeReserved,
          availableAfter: beforeAvailable - quantity,
          reservedAfter: beforeReserved,
          onHandAfter: beforeAvailable - quantity + beforeReserved,
          inventoryValueImpact: allocations.reduce((total, value) => total.plus(value.totalBuyingCost), new Prisma.Decimal(0)).negated(),
          stockLossAmount: allocations.reduce((total, value) => total.plus(value.totalBuyingCost), new Prisma.Decimal(0)),
          createdByProfileId: actorId,
        } });
        await createInventoryOperationAllocation(transaction, operation.id, allocations);
        await transaction.auditLog.create({ data: {
          actorProfileId: actorId,
          action: "STOCK_LOSS_RECORDED",
          entityType: "INVENTORY_OPERATION",
          entityId: operation.id,
          newData: { type: operation.type, quantity: quantity.toString(), stockLossAmount: operation.stockLossAmount.toString() },
          reason: input.note,
        } });
        return operation.id;
      }, SERIALIZABLE_TRANSACTION_OPTIONS);
      return prisma.inventoryOperation.findUniqueOrThrow({ where: { id: operationId }, include: { fifoAllocations: true } });
    } catch (error) { rethrowInventoryTransactionError(error); }
  }

  async function createStockReconciliation(input: StockReconciliationInput, actorId: string) {
    try {
      const operationId = await prisma.$transaction(async (transaction) => {
        const variant = await lockVariant(transaction, input.productVariantId);
        const actual = baseQuantityAllowingZero(input.actualAmount, input.amountUnit, variant.product.kind);
        const beforeAvailable = variant.availableStock;
        const beforeReserved = variant.reservedStock;
        const expectedOnHand = beforeAvailable + beforeReserved;
        const delta = actual - expectedOnHand;
        if (delta === 0) throw inventoryError(400, "NO_RECONCILIATION_NEEDED", "স্টকের কোনো পরিবর্তন দরকার নেই।");

        let allocations: FifoAllocation[] = [];
        let createdBatchId: string | undefined;
        let stockLossAmount = new Prisma.Decimal(0);
        let inventoryValueImpact = new Prisma.Decimal(0);
        if (delta < 0) {
          const missing = -delta;
          if (missing > beforeAvailable) {
            throw inventoryError(409, "RESERVED_STOCK_PROTECTED", "রিজার্ভ করা স্টক কমানো যাবে না। আগে সংশ্লিষ্ট অর্ডারটি সমাধান করুন।");
          }
          allocations = await consumeAvailableFifo(transaction, input.productVariantId, missing, variant.product.kind);
          stockLossAmount = allocations.reduce((total, value) => total.plus(value.totalBuyingCost), new Prisma.Decimal(0));
          inventoryValueImpact = stockLossAmount.negated();
        } else {
          const latestBatch = await transaction.stockBatch.findFirst({
            where: { productVariantId: input.productVariantId, unitBuyingCost: { gt: 0 } },
            orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
            select: { unitBuyingCost: true },
          });
          if (!latestBatch) throw inventoryError(409, "BUYING_COST_HISTORY_REQUIRED", "পজিটিভ স্টক অ্যাডজাস্টের আগে একটি ক্রয়মূল্যসহ স্টক অ্যাড করুন।");
          const batch = await transaction.stockBatch.create({ data: {
            productVariantId: input.productVariantId,
            source: "ADJUSTMENT",
            purchasedQuantity: delta,
            availableQuantity: delta,
            reservedQuantity: 0,
            unitBuyingCost: latestBatch.unitBuyingCost,
            purchaseDate: asDate(dhakaDateOnly()),
            note: input.note,
            createdByProfileId: actorId,
          } });
          createdBatchId = batch.id;
          await transaction.productVariant.update({ where: { id: input.productVariantId }, data: { availableStock: { increment: delta } } });
          inventoryValueImpact = quantityCost(latestBatch.unitBuyingCost, delta, variant.product.kind);
        }

        const operation = await transaction.inventoryOperation.create({ data: {
          productVariantId: input.productVariantId,
          type: "STOCK_RECONCILIATION",
          effectiveDate: asDate(dhakaDateOnly()),
          note: input.note,
          quantityDelta: delta,
          availableBefore: beforeAvailable,
          reservedBefore: beforeReserved,
          onHandBefore: expectedOnHand,
          availableAfter: beforeAvailable + delta,
          reservedAfter: beforeReserved,
          onHandAfter: actual,
          actualPhysicalStock: actual,
          inventoryValueImpact,
          stockLossAmount,
          createdStockBatchId: createdBatchId,
          createdByProfileId: actorId,
        } });
        await createInventoryOperationAllocation(transaction, operation.id, allocations);
        await transaction.auditLog.create({ data: {
          actorProfileId: actorId,
          action: "STOCK_RECONCILIATION_RECORDED",
          entityType: "INVENTORY_OPERATION",
          entityId: operation.id,
          newData: { actualPhysicalStock: actual, expectedPhysicalStock: expectedOnHand, quantityDelta: delta },
          reason: input.note,
        } });
        return operation.id;
      }, SERIALIZABLE_TRANSACTION_OPTIONS);
      return prisma.inventoryOperation.findUniqueOrThrow({ where: { id: operationId }, include: { fifoAllocations: true } });
    } catch (error) { rethrowInventoryTransactionError(error); }
  }

  async function correctStockBatch(batchId: string, input: StockBatchCorrectionInput, actorId: string) {
    try {
      const operationId = await prisma.$transaction(async (transaction) => {
        await transaction.$executeRaw(Prisma.sql`SELECT "id" FROM "stock_batches" WHERE "id" = ${batchId}::uuid FOR UPDATE`);
        const batch = await transaction.stockBatch.findUnique({
          where: { id: batchId },
          include: { productVariant: { select: { id: true, product: { select: { kind: true, isActive: true, category: { select: { isActive: true } } } } } } },
        });
        if (!batch || batch.source !== "PURCHASE") throw inventoryError(404, "CORRECTION_TARGET_NOT_FOUND", "এই রেকর্ডটি ঠিক করা যাবে না।");
        if (!batch.productVariant.product.isActive || batch.productVariant.product.category?.isActive === false) throw inventoryError(404, "ACTIVE_VARIANT_NOT_FOUND", "পণ্যটি ইনঅ্যাকটিভ অথবা পাওয়া যায়নি।");
        const returnedPhysical = await transaction.physicalSaleReturnAllocation.count({ where: { orderAllocation: { stockBatchId: batchId } } });
        const returnedOrders = await transaction.salesOrder.count({ where: { status: { in: ["RETURNED_SELLABLE", "RETURNED_DAMAGED"] }, items: { some: { allocations: { some: { stockBatchId: batchId } } } } } });
        if (returnedPhysical > 0 || returnedOrders > 0) throw inventoryError(409, "CORRECTION_RETURN_HISTORY", "রিটার্নের রেকর্ড থাকা স্টক এন্ট্রি ঠিক করা যাবে না।");
        const allocations = await transaction.orderAllocation.findMany({ where: { stockBatchId: batchId }, select: { id: true, quantity: true, state: true, salesOrderItemId: true } });
        const consumed = allocations.filter((value) => value.state === "CONSUMED").reduce((sum, value) => sum + value.quantity, 0);
        const reserved = allocations.filter((value) => value.state === "RESERVED").reduce((sum, value) => sum + value.quantity, 0);
        const correctedQuantity = baseQuantityAllowingZero(input.correctedAmount, input.amountUnit, batch.productVariant.product.kind);
        if (correctedQuantity < consumed + reserved) throw inventoryError(409, "CORRECTION_BELOW_COMMITTED", "সংশোধিত পরিমাণ ইতিমধ্যে বিক্রি বা রিজার্ভ করা পরিমাণের চেয়ে কম হতে পারবে না।");
        const quantityDelta = correctedQuantity - batch.purchasedQuantity;
        const availableAfter = batch.availableQuantity + quantityDelta;
        if (availableAfter < 0) throw inventoryError(409, "CORRECTION_BELOW_AVAILABLE", "এই পরিমাণ কমালে স্টক ঋণাত্মক হয়ে যাবে।");
        const variant = await lockVariant(transaction, batch.productVariantId);
        const costDelta = asMoney(input.unitBuyingCost).minus(batch.unitBuyingCost);
        const recognizedCostImpact = allocations.filter((value) => value.state === "CONSUMED").reduce(
          (total, value) => total.plus(quantityCost(costDelta, value.quantity, batch.productVariant.product.kind)), new Prisma.Decimal(0),
        );
        const oldInventoryValue = quantityCost(batch.unitBuyingCost, batch.availableQuantity + batch.reservedQuantity, batch.productVariant.product.kind);
        const newInventoryValue = quantityCost(asMoney(input.unitBuyingCost), availableAfter + batch.reservedQuantity, batch.productVariant.product.kind);
        await transaction.stockBatch.update({ where: { id: batchId }, data: {
          purchasedQuantity: correctedQuantity,
          availableQuantity: availableAfter,
          unitBuyingCost: input.unitBuyingCost,
        } });
        if (quantityDelta !== 0) {
          const updatedVariant = await transaction.productVariant.updateMany({ where: { id: batch.productVariantId, availableStock: { gte: quantityDelta < 0 ? -quantityDelta : 0 } }, data: { availableStock: quantityDelta > 0 ? { increment: quantityDelta } : { decrement: -quantityDelta } } });
          if (updatedVariant.count !== 1) throw inventoryError(409, "STOCK_TOTAL_MISMATCH", "স্টকের মোট হিসাব মেলেনি। আবার চেষ্টা করুন।");
        }
        const operation = await transaction.inventoryOperation.create({ data: {
          productVariantId: batch.productVariantId,
          type: "ENTRY_CORRECTION",
          effectiveDate: asDate(dhakaDateOnly()),
          quantityDelta,
          availableBefore: variant.availableStock,
          reservedBefore: variant.reservedStock,
          onHandBefore: variant.availableStock + variant.reservedStock,
          availableAfter: variant.availableStock + quantityDelta,
          reservedAfter: variant.reservedStock,
          onHandAfter: variant.availableStock + quantityDelta + variant.reservedStock,
          previousUnitBuyingCost: batch.unitBuyingCost,
          newUnitBuyingCost: input.unitBuyingCost,
          inventoryValueImpact: newInventoryValue.minus(oldInventoryValue),
          recognizedCostImpact,
          targetStockBatchId: batchId,
          createdByProfileId: actorId,
        } });
        const costCorrections = allocations.filter((value) => value.state === "CONSUMED" || value.state === "RESERVED");
        if (costCorrections.length > 0 && !costDelta.isZero()) {
          await transaction.inventoryCostCorrectionAllocation.createMany({ data: costCorrections.map((allocation) => ({
            inventoryOperationId: operation.id,
            orderAllocationId: allocation.id,
            quantity: allocation.quantity,
            previousUnitBuyingCost: batch.unitBuyingCost,
            newUnitBuyingCost: input.unitBuyingCost,
            totalCostDelta: quantityCost(costDelta, allocation.quantity, batch.productVariant.product.kind),
          })) });

          // Pending website orders display a projected buying cost. Keep that
          // projection in sync with a corrected purchase cost, while leaving
          // completed order snapshots immutable.
          const reservedDeltas = new Map<string, Prisma.Decimal>();
          for (const allocation of costCorrections.filter((value) => value.state === "RESERVED")) {
            const delta = quantityCost(costDelta, allocation.quantity, batch.productVariant.product.kind);
            reservedDeltas.set(
              allocation.salesOrderItemId,
              (reservedDeltas.get(allocation.salesOrderItemId) ?? new Prisma.Decimal(0)).plus(delta),
            );
          }
          if (reservedDeltas.size > 0) {
            const itemIds = [...reservedDeltas.keys()];
            const items = await transaction.salesOrderItem.findMany({
              where: { id: { in: itemIds } },
              select: { id: true, salesOrderId: true, netLineRevenue: true, totalBuyingCost: true },
            });
            const orderIds = new Set<string>();
            for (const item of items) {
              const nextCost = (item.totalBuyingCost ?? new Prisma.Decimal(0)).plus(reservedDeltas.get(item.id) ?? 0);
              await transaction.salesOrderItem.update({
                where: { id: item.id },
                data: { totalBuyingCost: nextCost, grossProfit: item.netLineRevenue.minus(nextCost) },
              });
              orderIds.add(item.salesOrderId);
            }
            for (const orderId of orderIds) {
              const orderItems = await transaction.salesOrderItem.findMany({
                where: { salesOrderId: orderId },
                select: { netLineRevenue: true, totalBuyingCost: true },
              });
              const totalBuyingCost = orderItems.reduce(
                (total, value) => total.plus(value.totalBuyingCost ?? 0),
                new Prisma.Decimal(0),
              );
              const order = await transaction.salesOrder.findUnique({
                where: { id: orderId },
                select: { subtotal: true, discountTotal: true, priceIncreaseTotal: true },
              });
              if (order) {
                const productRevenue = order.subtotal.minus(order.discountTotal).plus(order.priceIncreaseTotal);
                const grossProfit = productRevenue.minus(totalBuyingCost);
                await transaction.salesOrder.update({
                  where: { id: orderId },
                  data: {
                    totalBuyingCost,
                    grossProfit,
                    grossProfitMargin: productRevenue.isZero()
                      ? null
                      : grossProfit.div(productRevenue).mul(100).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP),
                  },
                });
              }
            }
          }
        }
        await transaction.auditLog.create({ data: {
          actorProfileId: actorId,
          action: "STOCK_ENTRY_CORRECTED",
          entityType: "STOCK_BATCH",
          entityId: batchId,
          previousData: { purchasedQuantity: batch.purchasedQuantity, unitBuyingCost: batch.unitBuyingCost.toString() },
          newData: { purchasedQuantity: correctedQuantity, unitBuyingCost: input.unitBuyingCost, operationId },
        } });
        return operation.id;
      }, SERIALIZABLE_TRANSACTION_OPTIONS);
      return prisma.inventoryOperation.findUniqueOrThrow({ where: { id: operationId }, include: { costCorrections: true } });
    } catch (error) { rethrowInventoryTransactionError(error); }
  }

  async function correctPaymentChannel(
    target: "SALE" | "CUSTOMER_PAYMENT" | "LEGACY_PAYMENT" | "RETURN",
    parentId: string,
    recordId: string | null,
    paymentChannel: PaymentChannel,
    actorId: string,
  ) {
    try {
      await prisma.$transaction(async (transaction) => {
        let previous: PaymentChannel;
        let entityId: string;
        if (target === "SALE") {
          const sale = await transaction.salesOrder.findUnique({ where: { id: parentId } });
          if (!sale || sale.source !== "PHYSICAL_SHOP" || sale.paymentMethod !== "CASH") {
            throw inventoryError(404, "PAID_SALE_NOT_FOUND", "Paid shop sale not found.");
          }
          previous = sale.paymentChannel ?? "CASH";
          entityId = sale.id;
          if (previous !== paymentChannel) {
            await transaction.salesOrder.update({ where: { id: sale.id }, data: { paymentChannel } });
          }
        } else if (target === "CUSTOMER_PAYMENT") {
          const payment = await transaction.creditCustomerPayment.findUnique({ where: { id: recordId! } });
          if (!payment || payment.creditCustomerId !== parentId || payment.voidedAt) {
            throw inventoryError(404, "PAYMENT_NOT_FOUND", "Active payment not found.");
          }
          previous = payment.paymentChannel ?? "CASH";
          entityId = payment.id;
          if (previous !== paymentChannel) {
            await transaction.creditCustomerPayment.update({ where: { id: payment.id }, data: { paymentChannel } });
          }
        } else if (target === "LEGACY_PAYMENT") {
          const payment = await transaction.creditPayment.findUnique({ where: { id: recordId! } });
          if (!payment || payment.salesOrderId !== parentId || payment.voidedAt) {
            throw inventoryError(404, "PAYMENT_NOT_FOUND", "Active payment not found.");
          }
          previous = payment.paymentChannel ?? "CASH";
          entityId = payment.id;
          if (previous !== paymentChannel) {
            await transaction.creditPayment.update({ where: { id: payment.id }, data: { paymentChannel } });
          }
        } else {
          const saleReturn = await transaction.physicalSaleReturn.findUnique({ where: { id: recordId! } });
          if (!saleReturn || saleReturn.salesOrderId !== parentId || saleReturn.cashRefundAmount.lte(0)) {
            throw inventoryError(404, "REFUND_NOT_FOUND", "Shop refund not found.");
          }
          previous = saleReturn.refundChannel ?? "CASH";
          entityId = saleReturn.id;
          if (previous !== paymentChannel) {
            await transaction.physicalSaleReturn.update({ where: { id: saleReturn.id }, data: { refundChannel: paymentChannel } });
          }
        }
        if (previous === paymentChannel) {
          throw inventoryError(409, "PAYMENT_METHOD_UNCHANGED", "This payment method is already saved.");
        }
        await transaction.auditLog.create({ data: {
          actorProfileId: actorId,
          action: "PAYMENT_CHANNEL_CORRECTED",
          entityType: target,
          entityId,
          previousData: { paymentChannel: previous },
          newData: { paymentChannel },
        } });
      }, SERIALIZABLE_TRANSACTION_OPTIONS);
    } catch (error) {
      rethrowInventoryTransactionError(error);
    }
  }
  return {
    listBatches,
    getInventorySummary,
    listInventoryItems,
    listInventoryItemBatches,
    listInventoryRecords,
    createStockLoss,
    createStockReconciliation,
    correctStockBatch,
    async correctPhysicalSalePaymentChannel(id: string, channel: PaymentChannel, actorId: string) {
      await correctPaymentChannel("SALE", id, null, channel, actorId);
      return readSale(id);
    },
    async correctPhysicalReturnChannel(id: string, returnId: string, channel: PaymentChannel, actorId: string) {
      await correctPaymentChannel("RETURN", id, returnId, channel, actorId);
      return readSale(id);
    },
    async correctCreditCustomerPaymentChannel(id: string, paymentId: string, channel: PaymentChannel, actorId: string) {
      await correctPaymentChannel("CUSTOMER_PAYMENT", id, paymentId, channel, actorId);
      return creditCustomerDetail(id);
    },
    async correctLegacyCreditPaymentChannel(id: string, paymentId: string, channel: PaymentChannel, actorId: string) {
      await correctPaymentChannel("LEGACY_PAYMENT", id, paymentId, channel, actorId);
      return readSale(id);
    },

    async createPurchase(input: PurchaseCreate, actorId: string) {
      const purchaseGroupId = randomUUID();
      let batchIds: string[];
      try {
        batchIds = await prisma.$transaction(async (transaction) => {
        const variantIds = input.items.map((item) => item.productVariantId);
        const variants = await transaction.productVariant.findMany({
          where: { id: { in: variantIds }, isActive: true },
          select: {
            id: true,
            product: { select: { kind: true, isActive: true, category: { select: { isActive: true } } } },
          },
        });
        if (variants.length !== variantIds.length || variants.some(({ product }) => !product.isActive || product.category?.isActive === false)) {
          throw inventoryError(404, "ACTIVE_VARIANT_NOT_FOUND", "ক্রয়ের এক বা একাধিক পণ্য ইনঅ্যাকটিভ অথবা পাওয়া যায়নি।");
        }
        const byId = new Map(variants.map((variant) => [variant.id, variant]));
        const ids: string[] = [];
        for (const item of input.items) {
          const quantity = toBaseQuantity(item.amount, item.amountUnit, byId.get(item.productVariantId)!.product.kind);
          const batch = await transaction.stockBatch.create({ data: {
            purchaseGroupId,
            productVariantId: item.productVariantId,
            source: "PURCHASE",
            purchasedQuantity: quantity,
            availableQuantity: quantity,
            unitBuyingCost: item.unitBuyingCost,
            purchaseDate: asDate(input.purchaseDate),
            note: input.note,
            createdByProfileId: actorId,
          } });
          await transaction.productVariant.update({
            where: { id: item.productVariantId },
            data: { availableStock: { increment: quantity } },
          });
          ids.push(batch.id);
        }
        return ids;
        }, SERIALIZABLE_TRANSACTION_OPTIONS);
      } catch (error) {
        rethrowInventoryTransactionError(error);
      }

      const batches = await prisma.stockBatch.findMany({
        where: { id: { in: batchIds } },
        include: fullBatchInclude,
        orderBy: { createdAt: "asc" },
      });
      return { purchaseGroupId, batches: batches.map(purchaseBatchDto) };
    },

    async adjustStock(input: StockAdjustmentInput, actorId: string) {
      try {
        await prisma.$transaction(async (transaction) => {
        const variant = await transaction.productVariant.findUnique({
          where: { id: input.productVariantId },
          select: {
            id: true,
            isActive: true,
            product: { select: { kind: true, isActive: true, category: { select: { isActive: true } } } },
          },
        });
        if (!variant || !variant.isActive || !variant.product.isActive || variant.product.category?.isActive === false) {
          throw inventoryError(404, "ACTIVE_VARIANT_NOT_FOUND", "নির্বাচিত পণ্যটি ইনঅ্যাকটিভ অথবা পাওয়া যায়নি।");
        }

        const quantity = toBaseQuantity(input.amount, input.amountUnit, variant.product.kind);
        if (input.direction === "INCREASE") {
          await transaction.stockBatch.create({ data: {
            productVariantId: input.productVariantId,
            source: "ADJUSTMENT",
            purchasedQuantity: quantity,
            availableQuantity: quantity,
            unitBuyingCost: input.unitBuyingCost,
            purchaseDate: asDate(input.purchaseDate),
            adjustmentReason: input.reason,
            createdByProfileId: actorId,
          } });
          await transaction.productVariant.update({
            where: { id: input.productVariantId },
            data: { availableStock: { increment: quantity } },
          });
        } else {
          await consumeAvailableFifo(transaction, input.productVariantId, quantity, variant.product.kind);
        }

        await transaction.stockAdjustment.create({ data: {
          productVariantId: input.productVariantId,
          direction: input.direction,
          quantity,
          unitBuyingCost: input.direction === "INCREASE" ? input.unitBuyingCost : null,
          reason: input.reason,
          createdByProfileId: actorId,
        } });
        }, SERIALIZABLE_TRANSACTION_OPTIONS);
      } catch (error) {
        rethrowInventoryTransactionError(error);
      }

      return listBatches({ productVariantId: input.productVariantId, limit: 100 });
    },

    async createPhysicalSale(input: PhysicalSaleCreate, actorId: string) {
      const today = dhakaDateOnly();
      const soldOn = input.soldOn ?? today;
      const earliestSoldOn = new Date(asDate(today).getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
      if (soldOn < earliestSoldOn || soldOn > today) {
        throw inventoryError(400, "INVALID_SOLD_ON", "বিক্রির তারিখ আজ থেকে আগের ৯০ দিনের মধ্যে হতে হবে।");
      }
      const requestFingerprint = input.idempotencyKey
        ? createHash("sha256").update(JSON.stringify({ actorId, ...input, idempotencyKey: undefined, confirmUnprofitable: undefined, confirmPriceIncrease: undefined })).digest("hex")
        : null;
      if (input.idempotencyKey) {
        const existing = await prisma.salesOrder.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, requestFingerprint: true, source: true } });
        if (existing) {
          if (existing.source !== "PHYSICAL_SHOP" || existing.requestFingerprint !== requestFingerprint) {
            throw inventoryError(409, "IDEMPOTENCY_KEY_REUSED", "এই বিক্রির রিকোয়েস্ট আগে অন্য তথ্য দিয়ে ব্যবহার হয়েছে।");
          }
          return readSale(existing.id);
        }
      }
      let saleId: string;
      try {
        saleId = await prisma.$transaction(async (transaction) => {
        let creditCustomer: { id: string; name: string; phone: string | null; nextFollowUpDate: Date | null } | null = null;
        let previousCustomerFollowUpDate: string | null = null;
        if (input.paymentMode === "CREDIT") {
          if (input.creditCustomerId) {
            await lockCreditCustomer(transaction, input.creditCustomerId);
            creditCustomer = await transaction.creditCustomer.findUnique({
              where: { id: input.creditCustomerId },
              select: { id: true, name: true, phone: true, nextFollowUpDate: true },
            });
            if (!creditCustomer) throw inventoryError(404, "CREDIT_CUSTOMER_NOT_FOUND", "Credit customer not found.");
          } else if (input.createCreditCustomer) {
            const name = cleanCreditCustomerName(input.customerName!);
            creditCustomer = await transaction.creditCustomer.create({ data: {
              name,
              normalizedName: normalizeCreditCustomerName(name),
              phone: input.customerPhone || null,
              nextFollowUpDate: asDate(input.nextFollowUpDate!),
              createdByProfileId: actorId,
            }, select: { id: true, name: true, phone: true, nextFollowUpDate: true } });
          }
          if (creditCustomer) {
          previousCustomerFollowUpDate = creditCustomer.nextFollowUpDate?.toISOString().slice(0, 10) ?? null;
          const nextPhone = input.customerPhone || creditCustomer.phone;
          if ((input.nextFollowUpDate && previousCustomerFollowUpDate !== input.nextFollowUpDate) || nextPhone !== creditCustomer.phone) {
            creditCustomer = await transaction.creditCustomer.update({
              where: { id: creditCustomer.id },
              data: {
                ...(input.nextFollowUpDate && previousCustomerFollowUpDate !== input.nextFollowUpDate
                  ? { nextFollowUpDate: asDate(input.nextFollowUpDate) }
                  : {}),
                ...(nextPhone !== creditCustomer.phone ? { phone: nextPhone } : {}),
              },
              select: { id: true, name: true, phone: true, nextFollowUpDate: true },
            });
          }
          }
        }
        const sortedItems = [...input.items].sort((left, right) =>
          left.productVariantId.localeCompare(right.productVariantId));
        const variants = await transaction.productVariant.findMany({
          where: { id: { in: sortedItems.map((item) => item.productVariantId) }, isActive: true },
          include: {
            product: {
              select: { id: true, name: true, isActive: true, kind: true, category: { select: { isActive: true } } },
            },
          },
        });
        if (variants.length !== sortedItems.length || variants.some((variant) => !variant.product.isActive || variant.product.category?.isActive === false)) {
          throw inventoryError(404, "SELLABLE_VARIANT_NOT_FOUND", "এক বা একাধিক প্যাক/সাইজ ইনঅ্যাকটিভ অথবা পাওয়া যায়নি।");
        }
        const byId = new Map(variants.map((variant) => [variant.id, variant]));
        const quantities = sortedItems.map((item) => {
          const variant = byId.get(item.productVariantId)!;
          return toBaseQuantity(item.amount, item.amountUnit, variant.product.kind);
        });
        const prices = sortedItems.map((item, index) => {
          const variant = byId.get(item.productVariantId)!;
          return sellingPriceForQuantity({
            kind: variant.product.kind,
            regularPrice: variant.currentSellingPrice,
            bulkPrice: variant.bulkSellingPrice,
            baseQuantity: quantities[index],
          });
        });
        const lineTotals = prices.map((price) => price.lineTotal);
        const subtotal = lineTotals.reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0));
        if (input.finalProductTotal === undefined && asMoney(input.discountTotal).gt(subtotal)) {
          throw inventoryError(400, "DISCOUNT_EXCEEDS_SUBTOTAL", "Discount cannot exceed subtotal.", {
            subtotal: Number(subtotal), discountTotal: Number(input.discountTotal),
          });
        }
        const finalProductTotal = input.finalProductTotal === undefined
          ? subtotal.minus(asMoney(input.discountTotal))
          : asMoney(input.finalProductTotal);
        const discount = Prisma.Decimal.max(subtotal.minus(finalProductTotal), 0);
        const priceIncrease = Prisma.Decimal.max(finalProductTotal.minus(subtotal), 0);
        if (discount.gt(subtotal)) {
          throw inventoryError(400, "DISCOUNT_EXCEEDS_SUBTOTAL", "Discount cannot exceed subtotal.", {
            subtotal: Number(subtotal),
            discountTotal: Number(discount),
          });
        }
        if (priceIncrease.gt(0) && !input.confirmPriceIncrease) {
          throw inventoryError(409, "PRICE_INCREASE_CONFIRMATION_REQUIRED", "পণ্যের দাম আগের দামের চেয়ে বেশি। কনফার্ম করুন।", {
            subtotal: Number(subtotal), finalProductTotal: Number(finalProductTotal), priceIncreaseTotal: Number(priceIncrease),
          });
        }
        const discounts = allocateSaleAmount(lineTotals, subtotal, discount);
        const priceIncreases = allocateSaleAmount(lineTotals, subtotal, priceIncrease);

        const fifoByVariant = new Map<string, FifoAllocation[]>();
        for (const [index, item] of sortedItems.entries()) {
          const variant = byId.get(item.productVariantId)!;
          fifoByVariant.set(
            item.productVariantId,
            await consumeAvailableFifo(transaction, item.productVariantId, quantities[index], variant.product.kind),
          );
        }

        const lineCosts = sortedItems.map((item) =>
          fifoByVariant.get(item.productVariantId)!.reduce(
            (sum, allocation) => sum.plus(allocation.totalBuyingCost),
            new Prisma.Decimal(0),
          ));
        const totalBuyingCost = lineCosts.reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0));
        const grandTotal = finalProductTotal;
        if (input.paymentMode === "CREDIT") {
          if (grandTotal.lte(0)) {
            throw inventoryError(400, "CREDIT_BALANCE_REQUIRED", "A credit sale must have an amount to collect.");
          }
          if (!input.nextFollowUpDate || input.nextFollowUpDate < dhakaDateOnly()) {
            throw inventoryError(400, "INVALID_FOLLOW_UP_DATE", "Follow-up date must be today or later.");
          }
        }
        const grossProfit = grandTotal.minus(totalBuyingCost);
        const isUnprofitable = grossProfit.isNegative();
        if (isUnprofitable && !input.confirmUnprofitable) {
          throw inventoryError(
            409,
            "UNPROFITABLE_SALE_CONFIRMATION_REQUIRED",
            "This discount makes the sale unprofitable. Explicit confirmation is required.",
            {
              subtotal: Number(subtotal),
              discountTotal: Number(discount),
              totalBuyingCost: Number(totalBuyingCost),
              projectedGrossProfit: Number(grossProfit),
            },
          );
        }
        const grossProfitMargin = grandTotal.isZero()
          ? null
          : grossProfit.div(grandTotal).mul(100).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
        const completedAt = new Date();
        const sale = await transaction.salesOrder.create({ data: {
          orderNumber: `PS-${completedAt.toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`,
          customerName: creditCustomer?.name ?? input.customerName,
          customerPhone: creditCustomer?.phone ?? input.customerPhone,
          creditCustomerId: creditCustomer?.id,
          subtotal,
          discountTotal: discount,
          priceIncreaseTotal: priceIncrease,
          grandTotal,
          totalBuyingCost,
          grossProfit,
          grossProfitMargin,
          unprofitableOverrideConfirmed: isUnprofitable,
          unprofitableOverrideByProfileId: isUnprofitable ? actorId : null,
          createdByProfileId: actorId,
          completedAt,
          soldOn: asDate(soldOn),
          idempotencyKey: input.idempotencyKey ?? null,
          requestFingerprint,
          paymentMethod: input.paymentMode === "CREDIT" ? "CREDIT" : "CASH",
          paymentChannel: input.paymentMode === "CREDIT" ? null : input.paymentChannel ?? "CASH",
          paymentStatus: input.paymentMode === "CREDIT" ? "UNPAID" : "PAID",
          nextFollowUpDate: input.paymentMode === "CREDIT" ? asDate(input.nextFollowUpDate!) : null,
        } });

        for (const [index, item] of sortedItems.entries()) {
          const variant = byId.get(item.productVariantId)!;
          const netLineRevenue = lineTotals[index].minus(discounts[index]).plus(priceIncreases[index]);
          const orderItem = await transaction.salesOrderItem.create({ data: {
            salesOrderId: sale.id,
            productId: variant.product.id,
            productVariantId: variant.id,
            productNameSnapshot: variant.product.name,
            variantNameSnapshot: variant.name,
            skuSnapshot: variant.sku,
            quantity: quantities[index],
            quantityUnit: quantityUnitForKind(variant.product.kind),
            unitLabelSnapshot: unitLabelForKind(variant.product.kind, variant.unitLabel),
            unitSellingPrice: prices[index].unitPrice,
            sellingPriceTier: prices[index].tier,
            grossLineRevenue: lineTotals[index],
            allocatedDiscount: discounts[index],
            allocatedPriceIncrease: priceIncreases[index],
            netLineRevenue,
            totalBuyingCost: lineCosts[index],
            grossProfit: netLineRevenue.minus(lineCosts[index]),
          } });
          for (const allocation of fifoByVariant.get(item.productVariantId)!) {
            await transaction.orderAllocation.create({ data: {
              salesOrderItemId: orderItem.id,
              stockBatchId: allocation.stockBatchId,
              quantity: allocation.quantity,
              unitBuyingCost: allocation.unitBuyingCost,
              totalBuyingCost: allocation.totalBuyingCost,
              state: "CONSUMED",
              consumedAt: completedAt,
            } });
          }
        }
        await transaction.auditLog.create({ data: {
          actorProfileId: actorId,
          action: soldOn < today ? "PAST_PHYSICAL_SALE_RECORDED" : "PHYSICAL_SALE_COMPLETED",
          entityType: "SALES_ORDER",
          entityId: sale.id,
          newData: {
            source: "PHYSICAL_SHOP",
            status: "COMPLETED",
            paymentMethod: input.paymentMode === "CREDIT" ? "CREDIT" : "CASH",
            paymentChannel: input.paymentMode === "CREDIT" ? null : input.paymentChannel ?? "CASH",
            paymentStatus: input.paymentMode === "CREDIT" ? "UNPAID" : "PAID",
            nextFollowUpDate: input.paymentMode === "CREDIT" ? input.nextFollowUpDate : null,
            creditCustomerId: creditCustomer?.id ?? null,
            soldOn,
            recordedAt: completedAt.toISOString(),
            finalProductTotal: Number(finalProductTotal),
            discountTotal: Number(discount),
            priceIncreaseTotal: Number(priceIncrease),
          },
        } });
        if (creditCustomer && previousCustomerFollowUpDate !== input.nextFollowUpDate) {
          await transaction.salesOrder.updateMany({
            where: { creditCustomerId: creditCustomer.id, paymentStatus: { in: ["UNPAID", "PARTIALLY_PAID"] } },
            data: { nextFollowUpDate: asDate(input.nextFollowUpDate!) },
          });
          await transaction.auditLog.create({ data: {
            actorProfileId: actorId,
            action: "CREDIT_CUSTOMER_FOLLOW_UP_CHANGED",
            entityType: "CREDIT_CUSTOMER",
            entityId: creditCustomer.id,
            previousData: { nextFollowUpDate: previousCustomerFollowUpDate },
            newData: { nextFollowUpDate: input.nextFollowUpDate, sourceSaleId: sale.id },
          } });
        }
        return sale.id;
        }, SERIALIZABLE_TRANSACTION_OPTIONS);
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          if (input.idempotencyKey) {
            const existing = await prisma.salesOrder.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, source: true, requestFingerprint: true } });
            if (existing?.source === "PHYSICAL_SHOP" && existing.requestFingerprint === requestFingerprint) return readSale(existing.id);
            if (existing) throw inventoryError(409, "IDEMPOTENCY_KEY_REUSED", "এই বিক্রির রিকোয়েস্ট আগে অন্য তথ্য দিয়ে ব্যবহার হয়েছে।");
          }
          throw inventoryError(409, "DUPLICATE_CREDIT_CUSTOMER_NAME", "A credit customer with this name already exists.");
        }
        rethrowInventoryTransactionError(error);
      }

      return readSale(saleId);
    },

    async returnPhysicalSale(id: string, input: PhysicalSaleReturnInput, actorId: string) {
      try {
        await prisma.$transaction(async (transaction) => {
          const target = await transaction.salesOrder.findUnique({ where: { id }, select: { creditCustomerId: true } });
          if (target?.creditCustomerId) await lockCreditCustomer(transaction, target.creditCustomerId);
          const locked = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT "id" FROM "sales_orders" WHERE "id" = ${id}::uuid FOR UPDATE
          `);
          if (locked.length === 0) throw inventoryError(404, "PHYSICAL_SALE_NOT_FOUND", "Physical sale not found.");

          const sale = await transaction.salesOrder.findUnique({
            where: { id },
            include: {
              creditPayments: { select: { amount: true, voidedAt: true } },
              physicalSaleReturns: { select: { refundAmount: true } },
              items: {
                include: {
                  physicalSaleReturnItems: { select: { quantity: true, refundAmount: true } },
                  allocations: {
                    orderBy: { createdAt: "asc" },
                    include: {
                      physicalSaleReturnAllocations: {
                        select: { quantity: true, totalBuyingCost: true },
                      },
                    },
                  },
                },
              },
            },
          });
          if (!sale || sale.source !== "PHYSICAL_SHOP") {
            throw inventoryError(404, "PHYSICAL_SALE_NOT_FOUND", "Physical sale not found.");
          }
          if (sale.status !== "COMPLETED") {
            throw inventoryError(409, "PHYSICAL_SALE_NOT_RETURNABLE", "Only a completed physical sale can accept item returns.");
          }

          const byId = new Map(sale.items.map((item) => [item.id, item]));
          const prepared = input.items.map((requested) => {
            const item = byId.get(requested.salesOrderItemId);
            if (!item) throw inventoryError(404, "SALE_ITEM_NOT_FOUND", "One or more sold items were not found in this sale.");
            const quantity = toBaseQuantity(requested.amount, requested.amountUnit, kindForQuantityUnit(item.quantityUnit));
            const alreadyReturned = item.physicalSaleReturnItems.reduce((total, value) => total + value.quantity, 0);
            const returnableQuantity = item.quantity - alreadyReturned;
            if (quantity > returnableQuantity) {
              throw inventoryError(409, "RETURN_QUANTITY_EXCEEDED", "The return quantity exceeds the remaining sold quantity.", {
                salesOrderItemId: item.id,
                requestedQuantity: quantity,
                returnableQuantity,
              });
            }
            const alreadyRefunded = item.physicalSaleReturnItems.reduce(
              (total, value) => total.plus(value.refundAmount),
              new Prisma.Decimal(0),
            );
            const refundAmount = proportionalMoney(
              item.netLineRevenue,
              quantity,
              item.quantity,
              alreadyRefunded,
              returnableQuantity,
            );

            let remaining = quantity;
            const allocations: Array<{
              id: string;
              quantity: number;
              unitBuyingCost: Prisma.Decimal;
              totalBuyingCost: Prisma.Decimal;
            }> = [];
            for (const allocation of item.allocations) {
              if (remaining === 0) break;
              if (allocation.state !== "CONSUMED") continue;
              const alreadyReturnedFromAllocation = allocation.physicalSaleReturnAllocations.reduce(
                (total, value) => total + value.quantity,
                0,
              );
              const allocationRemaining = allocation.quantity - alreadyReturnedFromAllocation;
              if (allocationRemaining <= 0) continue;
              const allocationQuantity = Math.min(remaining, allocationRemaining);
              const alreadyReversedCost = allocation.physicalSaleReturnAllocations.reduce(
                (total, value) => total.plus(value.totalBuyingCost),
                new Prisma.Decimal(0),
              );
              allocations.push({
                id: allocation.id,
                quantity: allocationQuantity,
                unitBuyingCost: allocation.unitBuyingCost,
                totalBuyingCost: proportionalMoney(
                  allocation.totalBuyingCost,
                  allocationQuantity,
                  allocation.quantity,
                  alreadyReversedCost,
                  allocationRemaining,
                ),
              });
              remaining -= allocationQuantity;
            }
            if (remaining !== 0) {
              throw inventoryError(409, "RETURN_ALLOCATION_MISMATCH", "The original FIFO allocations cannot cover this return.");
            }
            const reversedBuyingCost = allocations.reduce(
              (total, value) => total.plus(value.totalBuyingCost),
              new Prisma.Decimal(0),
            );
            return {
              item,
              quantity,
              refundAmount,
              reversedBuyingCost,
              reversedGrossProfit: refundAmount.minus(reversedBuyingCost),
              allocations,
            };
          });

          const refundAmount = prepared.reduce((total, value) => total.plus(value.refundAmount), new Prisma.Decimal(0));
          const reversedBuyingCost = prepared.reduce((total, value) => total.plus(value.reversedBuyingCost), new Prisma.Decimal(0));
          const reversedGrossProfit = refundAmount.minus(reversedBuyingCost);
          const creditCustomerBeforeReturn = sale.creditCustomerId
            ? customerBalance(await readCreditCustomer(sale.creditCustomerId, transaction))
            : null;
          const creditBeforeReturn = creditCustomerBeforeReturn ?? activeCreditTotal(sale);
          const creditOffsetAmount = sale.paymentMethod === "CREDIT"
            ? Prisma.Decimal.min(refundAmount, creditBeforeReturn.outstanding)
            : new Prisma.Decimal(0);
          const cashRefundAmount = refundAmount.minus(creditOffsetAmount);
          const returnedAt = new Date();
          const physicalReturn = await transaction.physicalSaleReturn.create({ data: {
            salesOrderId: sale.id,
            condition: input.condition,
            reason: input.reason,
            refundAmount,
            creditOffsetAmount,
            cashRefundAmount,
            refundChannel: cashRefundAmount.gt(0) ? input.refundChannel ?? "CASH" : null,
            reversedBuyingCost,
            reversedGrossProfit,
            createdByProfileId: actorId,
            createdAt: returnedAt,
          } });

          for (const value of prepared) {
            const returnItem = await transaction.physicalSaleReturnItem.create({ data: {
              physicalSaleReturnId: physicalReturn.id,
              salesOrderItemId: value.item.id,
              quantity: value.quantity,
              refundAmount: value.refundAmount,
              reversedBuyingCost: value.reversedBuyingCost,
              reversedGrossProfit: value.reversedGrossProfit,
              createdAt: returnedAt,
            } });
            for (const allocation of value.allocations) {
              let restoredStockBatchId: string | undefined;
              if (input.condition === "SELLABLE") {
                const batch = await transaction.stockBatch.create({ data: {
                  productVariantId: value.item.productVariantId,
                  source: "SELLABLE_RETURN",
                  purchasedQuantity: allocation.quantity,
                  availableQuantity: allocation.quantity,
                  unitBuyingCost: allocation.unitBuyingCost,
                  purchaseDate: new Date(`${dhakaDateOnly(returnedAt)}T00:00:00.000Z`),
                  note: input.reason,
                  sourceSalesOrderId: sale.id,
                  createdByProfileId: actorId,
                } });
                restoredStockBatchId = batch.id;
                await transaction.productVariant.update({
                  where: { id: value.item.productVariantId },
                  data: { availableStock: { increment: allocation.quantity } },
                });
              }
              await transaction.physicalSaleReturnAllocation.create({ data: {
                physicalSaleReturnItemId: returnItem.id,
                orderAllocationId: allocation.id,
                restoredStockBatchId,
                quantity: allocation.quantity,
                unitBuyingCost: allocation.unitBuyingCost,
                totalBuyingCost: allocation.totalBuyingCost,
                createdAt: returnedAt,
              } });
            }
          }

          if (sale.creditCustomerId) {
            await rebuildCustomerPaymentAllocations(transaction, sale.creditCustomerId);
          } else if (sale.paymentMethod === "CREDIT") {
            const outstandingAfter = Prisma.Decimal.max(creditBeforeReturn.outstanding.minus(creditOffsetAmount), 0);
            await transaction.salesOrder.update({
              where: { id: sale.id },
              data: {
                paymentStatus: creditPaymentStatus(creditBeforeReturn.collected, outstandingAfter),
                ...(outstandingAfter.isZero() ? { nextFollowUpDate: null } : {}),
              },
            });
          }

          await transaction.auditLog.create({ data: {
            actorProfileId: actorId,
            action: "PHYSICAL_SALE_ITEMS_RETURNED",
            entityType: "SALES_ORDER",
            entityId: sale.id,
            newData: {
              returnId: physicalReturn.id,
              condition: input.condition,
              refundAmount: refundAmount.toString(),
              creditOffsetAmount: creditOffsetAmount.toString(),
              cashRefundAmount: cashRefundAmount.toString(),
              refundChannel: cashRefundAmount.gt(0) ? input.refundChannel ?? "CASH" : null,
              reversedBuyingCost: reversedBuyingCost.toString(),
              items: prepared.map((value) => ({ salesOrderItemId: value.item.id, quantity: value.quantity })),
            },
            reason: input.reason,
          } });
        }, SERIALIZABLE_TRANSACTION_OPTIONS);
      } catch (error) {
        rethrowInventoryTransactionError(error);
      }
      return readSale(id);
    },

    async listPhysicalSales(input: PhysicalSaleList) {
      const product = input.product?.trim();
      const query = input.query?.trim();
      const exactTotal = query && /^\d+(?:\.\d{1,2})?$/.test(query)
        ? new Prisma.Decimal(query)
        : null;
      const sales = await prisma.salesOrder.findMany({
        where: {
          source: "PHYSICAL_SHOP",
          status: "COMPLETED",
          ...(input.dateFrom || input.dateTo ? { completedAt: {
            ...(input.dateFrom ? { gte: new Date(`${input.dateFrom}T00:00:00+06:00`) } : {}),
            ...(input.dateTo ? { lt: new Date(`${nextDate(input.dateTo)}T00:00:00+06:00`) } : {}),
          } } : {}),
          ...(product ? { items: { some: {
            OR: [
              { productNameSnapshot: { contains: product, mode: "insensitive" } },
              { variantNameSnapshot: { contains: product, mode: "insensitive" } },
            ],
          } } } : {}),
          ...(query ? { OR: [
            { orderNumber: { contains: query, mode: "insensitive" } },
            { customerName: { contains: query, mode: "insensitive" } },
            { customerPhone: { contains: query } },
            ...(exactTotal ? [{ grandTotal: exactTotal }] : []),
          ] } : {}),
        },
        include: saleInclude,
        orderBy: { completedAt: "desc" },
        take: input.limit,
      });
      return sales.map(saleDto);
    },

    async suggestCreditCustomers(input: CreditCustomerSuggestion) {
      const customers = await prisma.creditCustomer.findMany({
        where: { name: { contains: input.query, mode: "insensitive" } },
        include: creditCustomerBalanceInclude,
        orderBy: { name: "asc" },
        take: input.limit,
      });
      return customers.map((customer) => {
        const value = creditCustomerDto(customer);
        return {
          id: value.id,
          name: value.name,
          phone: value.phone,
          nextFollowUpDate: value.nextFollowUpDate,
          outstandingAmount: value.outstandingAmount,
        };
      });
    },

    async listCreditCustomers(input: CreditCustomerList) {
      const query = input.query?.trim();
      const customers = await prisma.creditCustomer.findMany({
        where: query ? { OR: [
          { name: { contains: query, mode: "insensitive" } },
          { phone: { contains: query } },
        ] } : undefined,
        include: creditCustomerBalanceInclude,
        orderBy: [{ nextFollowUpDate: "asc" }, { name: "asc" }],
      });
      const today = dhakaDateOnly();
      const filtered = customers.map(creditCustomerDto).filter((customer) => {
        const open = customer.outstandingAmount > 0;
        if (input.state === "ALL") return true;
        if (input.state === "SETTLED") return !open;
        if (!open) return false;
        if (input.state === "OVERDUE") return Boolean(customer.nextFollowUpDate && customer.nextFollowUpDate < today);
        if (input.state === "TODAY") return customer.nextFollowUpDate === today;
        if (input.state === "UPCOMING") return Boolean(customer.nextFollowUpDate && customer.nextFollowUpDate > today);
        return true;
      });
      const start = (input.page - 1) * input.limit;
      return {
        data: filtered.slice(start, start + input.limit),
        total: filtered.length,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(filtered.length / input.limit),
      };
    },

    async getCreditCustomerSummary() {
      const customers = await prisma.creditCustomer.findMany({ include: creditCustomerBalanceInclude });
      const today = dhakaDateOnly();
      const open = customers.map(creditCustomerDto).filter((customer) => customer.outstandingAmount > 0);
      return {
        totalOutstanding: open.reduce((sum, customer) => sum + customer.outstandingAmount, 0),
        openSaleCount: open.reduce((sum, customer) => sum + customer.saleCount, 0),
        customerCount: open.length,
        overdueCount: open.filter((customer) => customer.nextFollowUpDate && customer.nextFollowUpDate < today).length,
        dueTodayCount: open.filter((customer) => customer.nextFollowUpDate === today).length,
        upcomingCount: open.filter((customer) => customer.nextFollowUpDate && customer.nextFollowUpDate > today).length,
      };
    },

    async getCreditCustomer(id: string) {
      return creditCustomerDetail(id);
    },

    async updateCreditCustomer(id: string, input: CreditCustomerUpdate, actorId: string) {
      const name = cleanCreditCustomerName(input.name);
      try {
        await prisma.$transaction(async (transaction) => {
          await lockCreditCustomer(transaction, id);
          const current = await transaction.creditCustomer.findUnique({ where: { id } });
          if (!current) throw inventoryError(404, "CREDIT_CUSTOMER_NOT_FOUND", "Credit customer not found.");
          await transaction.creditCustomer.update({
            where: { id },
            data: {
              name,
              normalizedName: normalizeCreditCustomerName(name),
              ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
            },
          });
          await transaction.auditLog.create({ data: {
            actorProfileId: actorId,
            action: "CREDIT_CUSTOMER_UPDATED",
            entityType: "CREDIT_CUSTOMER",
            entityId: id,
            previousData: { name: current.name, phone: current.phone },
            newData: { name, phone: input.phone === undefined ? current.phone : input.phone || null },
          } });
        }, SERIALIZABLE_TRANSACTION_OPTIONS);
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw inventoryError(409, "DUPLICATE_CREDIT_CUSTOMER_NAME", "A credit customer with this name already exists.");
        }
        rethrowInventoryTransactionError(error);
      }
      return creditCustomerDto(await readCreditCustomer(id));
    },

    async recordCreditCustomerPayment(id: string, input: CreditPaymentCreate, actorId: string) {
      if (input.paidOn > dhakaDateOnly()) {
        throw inventoryError(400, "FUTURE_PAYMENT_DATE", "Payment date cannot be in the future.");
      }
      try {
        await prisma.$transaction(async (transaction) => {
          await lockCreditCustomer(transaction, id);
          const duplicate = await transaction.creditCustomerPayment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
          if (duplicate) {
            if (duplicate.creditCustomerId !== id) {
              throw inventoryError(409, "PAYMENT_REQUEST_CONFLICT", "This payment request belongs to another customer.");
            }
            return;
          }
          const customer = await readCreditCustomer(id, transaction);
          const balance = customerBalance(customer);
          const amount = asMoney(input.amount);
          if (balance.outstanding.isZero()) throw inventoryError(409, "CREDIT_ALREADY_SETTLED", "This customer has no outstanding balance.");
          if (amount.gt(balance.outstanding)) {
            throw inventoryError(400, "PAYMENT_EXCEEDS_BALANCE", "Payment cannot exceed the outstanding balance.", {
              outstandingAmount: Number(balance.outstanding),
            });
          }
          const payment = await transaction.creditCustomerPayment.create({ data: {
            creditCustomerId: id,
            idempotencyKey: input.idempotencyKey,
            amount,
            paidOn: asDate(input.paidOn),
            paymentChannel: input.paymentChannel,
            note: input.note,
            createdByProfileId: actorId,
          } });
          await rebuildCustomerPaymentAllocations(transaction, id);
          await transaction.auditLog.create({ data: {
            actorProfileId: actorId,
            action: "CREDIT_CUSTOMER_PAYMENT_RECORDED",
            entityType: "CREDIT_CUSTOMER",
            entityId: id,
            newData: { paymentId: payment.id, amount: amount.toString(), paidOn: input.paidOn, paymentChannel: input.paymentChannel, note: input.note ?? null },
          } });
        }, SERIALIZABLE_TRANSACTION_OPTIONS);
      } catch (error) {
        rethrowInventoryTransactionError(error);
      }
      return creditCustomerDetail(id);
    },

    async voidCreditCustomerPayment(id: string, paymentId: string, input: CreditPaymentVoid, actorId: string) {
      try {
        await prisma.$transaction(async (transaction) => {
          await lockCreditCustomer(transaction, id);
          const payment = await transaction.creditCustomerPayment.findUnique({ where: { id: paymentId } });
          if (!payment || payment.creditCustomerId !== id) throw inventoryError(404, "CREDIT_PAYMENT_NOT_FOUND", "Credit payment not found.");
          if (payment.voidedAt) throw inventoryError(409, "CREDIT_PAYMENT_ALREADY_VOIDED", "This credit payment is already voided.");
          await transaction.creditCustomerPayment.update({
            where: { id: paymentId },
            data: { voidedAt: new Date(), voidedByProfileId: actorId, voidReason: input.reason },
          });
          const afterVoid = await readCreditCustomer(id, transaction);
          if (customerBalance(afterVoid).outstanding.gt(0) && !afterVoid.nextFollowUpDate) {
            await transaction.creditCustomer.update({ where: { id }, data: { nextFollowUpDate: asDate(dhakaDateOnly()) } });
          }
          await rebuildCustomerPaymentAllocations(transaction, id);
          await transaction.auditLog.create({ data: {
            actorProfileId: actorId,
            action: "CREDIT_CUSTOMER_PAYMENT_VOIDED",
            entityType: "CREDIT_CUSTOMER",
            entityId: id,
            previousData: { paymentId, amount: payment.amount.toString() },
            reason: input.reason,
          } });
        }, SERIALIZABLE_TRANSACTION_OPTIONS);
      } catch (error) {
        rethrowInventoryTransactionError(error);
      }
      return creditCustomerDetail(id);
    },

    async rescheduleCreditCustomerFollowUp(id: string, input: CreditFollowUp, actorId: string) {
      if (input.nextFollowUpDate < dhakaDateOnly()) {
        throw inventoryError(400, "INVALID_FOLLOW_UP_DATE", "Follow-up date must be today or later.");
      }
      try {
        await prisma.$transaction(async (transaction) => {
          await lockCreditCustomer(transaction, id);
          const customer = await readCreditCustomer(id, transaction);
          if (customerBalance(customer).outstanding.isZero()) {
            throw inventoryError(409, "CREDIT_ALREADY_SETTLED", "A settled customer does not need a follow-up date.");
          }
          const previous = customer.nextFollowUpDate?.toISOString().slice(0, 10) ?? null;
          await transaction.creditCustomer.update({ where: { id }, data: { nextFollowUpDate: asDate(input.nextFollowUpDate) } });
          await transaction.salesOrder.updateMany({
            where: { creditCustomerId: id, paymentStatus: { in: ["UNPAID", "PARTIALLY_PAID"] } },
            data: { nextFollowUpDate: asDate(input.nextFollowUpDate) },
          });
          await transaction.auditLog.create({ data: {
            actorProfileId: actorId,
            action: "CREDIT_CUSTOMER_FOLLOW_UP_CHANGED",
            entityType: "CREDIT_CUSTOMER",
            entityId: id,
            previousData: { nextFollowUpDate: previous },
            newData: { nextFollowUpDate: input.nextFollowUpDate, note: input.note ?? null },
          } });
        }, SERIALIZABLE_TRANSACTION_OPTIONS);
      } catch (error) {
        rethrowInventoryTransactionError(error);
      }
      return creditCustomerDto(await readCreditCustomer(id));
    },

    async listCreditSales(input: CreditSaleList) {
      const today = asDate(dhakaDateOnly());
      const query = input.query?.trim();
      const openStatuses = ["UNPAID", "PARTIALLY_PAID"] as const;
      const stateWhere = input.state === "SETTLED"
        ? { paymentStatus: "PAID" as const }
        : input.state === "ALL"
          ? {}
          : {
              paymentStatus: { in: [...openStatuses] },
              ...(input.state === "OVERDUE" ? { nextFollowUpDate: { lt: today } }
                : input.state === "TODAY" ? { nextFollowUpDate: today }
                  : input.state === "UPCOMING" ? { nextFollowUpDate: { gt: today } }
                    : {}),
            };
      const where: Prisma.SalesOrderWhereInput = {
        source: "PHYSICAL_SHOP",
        paymentMethod: "CREDIT",
        ...stateWhere,
        ...(query ? { OR: [
          { orderNumber: { contains: query, mode: "insensitive" } },
          { customerName: { contains: query, mode: "insensitive" } },
          { customerPhone: { contains: query } },
        ] } : {}),
      };
      const [sales, total] = await Promise.all([
        prisma.salesOrder.findMany({
          where,
          include: saleInclude,
          orderBy: [{ nextFollowUpDate: "asc" }, { completedAt: "desc" }],
          skip: (input.page - 1) * input.limit,
          take: input.limit,
        }),
        prisma.salesOrder.count({ where }),
      ]);
      return {
        data: sales.map(saleDto),
        total,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(total / input.limit),
      };
    },

    async getCreditSummary() {
      const today = dhakaDateOnly();
      const sales = await prisma.salesOrder.findMany({
        where: {
          source: "PHYSICAL_SHOP",
          paymentMethod: "CREDIT",
          paymentStatus: { in: ["UNPAID", "PARTIALLY_PAID"] },
        },
        select: {
          customerPhone: true,
          nextFollowUpDate: true,
          grandTotal: true,
          physicalSaleReturns: { select: { refundAmount: true } },
          creditPayments: { select: { amount: true, voidedAt: true } },
        },
      });
      let overdueCount = 0;
      let dueTodayCount = 0;
      let upcomingCount = 0;
      let totalOutstanding = new Prisma.Decimal(0);
      const customers = new Set<string>();
      for (const sale of sales) {
        const followUp = sale.nextFollowUpDate?.toISOString().slice(0, 10);
        if (followUp && followUp < today) overdueCount += 1;
        else if (followUp === today) dueTodayCount += 1;
        else if (followUp && followUp > today) upcomingCount += 1;
        totalOutstanding = totalOutstanding.plus(activeCreditTotal(sale).outstanding);
        if (sale.customerPhone) customers.add(sale.customerPhone);
      }
      return {
        totalOutstanding: Number(totalOutstanding),
        openSaleCount: sales.length,
        customerCount: customers.size,
        overdueCount,
        dueTodayCount,
        upcomingCount,
      };
    },

    async getCreditSale(id: string) {
      const sale = await prisma.salesOrder.findUnique({ where: { id }, include: saleInclude });
      if (!sale || sale.source !== "PHYSICAL_SHOP" || sale.paymentMethod !== "CREDIT") {
        throw inventoryError(404, "CREDIT_SALE_NOT_FOUND", "Credit sale not found.");
      }
      const history = await prisma.auditLog.findMany({
        where: { entityType: "SALES_ORDER", entityId: id, action: "CREDIT_FOLLOW_UP_RESCHEDULED" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          previousData: true,
          newData: true,
          createdAt: true,
          actor: { select: { fullName: true, role: true } },
        },
      });
      return { ...saleDto(sale), followUpHistory: history };
    },

    async recordCreditPayment(id: string, input: CreditPaymentCreate, actorId: string) {
      if (input.paidOn > dhakaDateOnly()) {
        throw inventoryError(400, "FUTURE_PAYMENT_DATE", "Payment date cannot be in the future.");
      }
      try {
        await prisma.$transaction(async (transaction) => {
          const locked = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT "id" FROM "sales_orders" WHERE "id" = ${id}::uuid FOR UPDATE
          `);
          if (locked.length === 0) throw inventoryError(404, "CREDIT_SALE_NOT_FOUND", "Credit sale not found.");
          const duplicate = await transaction.creditPayment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
          if (duplicate) {
            if (duplicate.salesOrderId !== id) {
              throw inventoryError(409, "PAYMENT_REQUEST_CONFLICT", "This payment request belongs to another sale.");
            }
            return;
          }
          const sale = await transaction.salesOrder.findUnique({
            where: { id },
            include: {
              physicalSaleReturns: { select: { refundAmount: true } },
              creditPayments: { select: { amount: true, voidedAt: true } },
            },
          });
          if (!sale || sale.source !== "PHYSICAL_SHOP" || sale.paymentMethod !== "CREDIT") {
            throw inventoryError(404, "CREDIT_SALE_NOT_FOUND", "Credit sale not found.");
          }
          const balance = activeCreditTotal(sale);
          const amount = asMoney(input.amount);
          if (balance.outstanding.isZero()) {
            throw inventoryError(409, "CREDIT_ALREADY_SETTLED", "This credit sale is already settled.");
          }
          if (amount.gt(balance.outstanding)) {
            throw inventoryError(400, "PAYMENT_EXCEEDS_BALANCE", "Payment cannot exceed the outstanding balance.", {
              outstandingAmount: Number(balance.outstanding),
            });
          }
          await transaction.creditPayment.create({ data: {
            salesOrderId: id,
            idempotencyKey: input.idempotencyKey,
            amount,
            paidOn: asDate(input.paidOn),
            paymentChannel: input.paymentChannel,
            note: input.note,
            createdByProfileId: actorId,
          } });
          const collected = balance.collected.plus(amount);
          const outstanding = balance.outstanding.minus(amount);
          await transaction.salesOrder.update({
            where: { id },
            data: {
              paymentStatus: creditPaymentStatus(collected, outstanding),
              ...(outstanding.isZero() ? { nextFollowUpDate: null } : {}),
            },
          });
          await transaction.auditLog.create({ data: {
            actorProfileId: actorId,
            action: "CREDIT_PAYMENT_RECORDED",
            entityType: "SALES_ORDER",
            entityId: id,
            newData: { amount: amount.toString(), paidOn: input.paidOn, paymentChannel: input.paymentChannel, note: input.note ?? null },
          } });
        }, SERIALIZABLE_TRANSACTION_OPTIONS);
      } catch (error) {
        rethrowInventoryTransactionError(error);
      }
      return readSale(id);
    },

    async voidCreditPayment(id: string, paymentId: string, input: CreditPaymentVoid, actorId: string) {
      try {
        await prisma.$transaction(async (transaction) => {
          const locked = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT "id" FROM "sales_orders" WHERE "id" = ${id}::uuid FOR UPDATE
          `);
          if (locked.length === 0) throw inventoryError(404, "CREDIT_SALE_NOT_FOUND", "Credit sale not found.");
          const sale = await transaction.salesOrder.findUnique({
            where: { id },
            include: {
              physicalSaleReturns: { select: { refundAmount: true } },
              creditPayments: { select: { id: true, amount: true, voidedAt: true } },
            },
          });
          if (!sale || sale.source !== "PHYSICAL_SHOP" || sale.paymentMethod !== "CREDIT") {
            throw inventoryError(404, "CREDIT_SALE_NOT_FOUND", "Credit sale not found.");
          }
          const payment = sale.creditPayments.find((value) => value.id === paymentId);
          if (!payment) throw inventoryError(404, "CREDIT_PAYMENT_NOT_FOUND", "Credit payment not found.");
          if (payment.voidedAt) throw inventoryError(409, "CREDIT_PAYMENT_ALREADY_VOIDED", "This payment is already voided.");
          await transaction.creditPayment.update({
            where: { id: paymentId },
            data: { voidedAt: new Date(), voidedByProfileId: actorId, voidReason: input.reason },
          });
          const activeCollected = sale.creditPayments.reduce(
            (total, value) => value.voidedAt || value.id === paymentId ? total : total.plus(value.amount),
            new Prisma.Decimal(0),
          );
          const returned = sale.physicalSaleReturns.reduce((total, value) => total.plus(value.refundAmount), new Prisma.Decimal(0));
          const currentSaleValue = Prisma.Decimal.max(sale.grandTotal.minus(returned), 0);
          const outstanding = Prisma.Decimal.max(currentSaleValue.minus(activeCollected), 0);
          await transaction.salesOrder.update({
            where: { id },
            data: {
              paymentStatus: creditPaymentStatus(activeCollected, outstanding),
              ...(outstanding.gt(0) && sale.nextFollowUpDate === null ? { nextFollowUpDate: asDate(dhakaDateOnly()) } : {}),
            },
          });
          await transaction.auditLog.create({ data: {
            actorProfileId: actorId,
            action: "CREDIT_PAYMENT_VOIDED",
            entityType: "SALES_ORDER",
            entityId: id,
            previousData: { paymentId, amount: payment.amount.toString() },
            reason: input.reason,
          } });
        }, SERIALIZABLE_TRANSACTION_OPTIONS);
      } catch (error) {
        rethrowInventoryTransactionError(error);
      }
      return readSale(id);
    },

    async rescheduleCreditFollowUp(id: string, input: CreditFollowUp, actorId: string) {
      if (input.nextFollowUpDate < dhakaDateOnly()) {
        throw inventoryError(400, "INVALID_FOLLOW_UP_DATE", "Follow-up date must be today or later.");
      }
      try {
        await prisma.$transaction(async (transaction) => {
          const locked = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT "id" FROM "sales_orders" WHERE "id" = ${id}::uuid FOR UPDATE
          `);
          if (locked.length === 0) throw inventoryError(404, "CREDIT_SALE_NOT_FOUND", "Credit sale not found.");
          const sale = await transaction.salesOrder.findUnique({ where: { id } });
          if (!sale || sale.source !== "PHYSICAL_SHOP" || sale.paymentMethod !== "CREDIT") {
            throw inventoryError(404, "CREDIT_SALE_NOT_FOUND", "Credit sale not found.");
          }
          if (sale.paymentStatus === "PAID") {
            throw inventoryError(409, "CREDIT_ALREADY_SETTLED", "A settled credit sale does not need a follow-up date.");
          }
          const previous = sale.nextFollowUpDate?.toISOString().slice(0, 10) ?? null;
          await transaction.salesOrder.update({ where: { id }, data: { nextFollowUpDate: asDate(input.nextFollowUpDate) } });
          await transaction.auditLog.create({ data: {
            actorProfileId: actorId,
            action: "CREDIT_FOLLOW_UP_RESCHEDULED",
            entityType: "SALES_ORDER",
            entityId: id,
            previousData: { nextFollowUpDate: previous },
            newData: { nextFollowUpDate: input.nextFollowUpDate, note: input.note ?? null },
          } });
        }, SERIALIZABLE_TRANSACTION_OPTIONS);
      } catch (error) {
        rethrowInventoryTransactionError(error);
      }
      return readSale(id);
    },
  };
}

export type InventoryService = ReturnType<typeof createInventoryService>;
