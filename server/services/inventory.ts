import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import type {
  CreditFollowUp,
  CreditPaymentCreate,
  CreditPaymentVoid,
  CreditSaleList,
  PhysicalSaleCreate,
  PhysicalSaleList,
  PhysicalSaleReturnInput,
  PurchaseCreate,
  StockAdjustmentInput,
  StockBatchList,
} from "../schemas/inventory.js";
import { consumeAvailableFifo, type FifoAllocation } from "./stockAllocation.js";
import { quantityCost, quantityUnitForKind, toBaseQuantity } from "../lib/quantity.js";
import { isTransactionTimeout, SERIALIZABLE_TRANSACTION_OPTIONS } from "../lib/transactions.js";

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
  creditPayments: {
    orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }],
    include: {
      createdBy: { select: { fullName: true, role: true } },
      voidedBy: { select: { fullName: true, role: true } },
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
  const creditPayments = sale.creditPayments ?? [];
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
    paymentStatus: sale.paymentStatus,
    nextFollowUpDate: sale.nextFollowUpDate?.toISOString().slice(0, 10) ?? null,
    customerName: sale.customerName,
    customerPhone: sale.customerPhone,
    subtotal: moneyNumber(sale.subtotal),
    discountTotal: moneyNumber(sale.discountTotal),
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
    items: sale.items.map((item) => {
      const returnedQuantity = item.physicalSaleReturnItems.reduce((total, value) => total + value.quantity, 0);
      return ({
      id: item.id,
      productId: item.productId,
      productVariantId: item.productVariantId,
      productName: item.productNameSnapshot,
      variantName: item.variantNameSnapshot,
      quantityUnit: item.quantityUnit,
      sku: item.skuSnapshot,
      quantity: item.quantity,
      unitSellingPrice: moneyNumber(item.unitSellingPrice),
      grossLineRevenue: moneyNumber(item.grossLineRevenue),
      allocatedDiscount: moneyNumber(item.allocatedDiscount),
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


function allocateDiscount(
  lineTotals: Prisma.Decimal[],
  subtotal: Prisma.Decimal,
  discount: Prisma.Decimal,
): Prisma.Decimal[] {
  if (discount.isZero()) return lineTotals.map(() => new Prisma.Decimal(0));
  let assigned = new Prisma.Decimal(0);
  return lineTotals.map((lineTotal, index) => {
    if (index === lineTotals.length - 1) return discount.minus(assigned);
    const roundedShare = lineTotal.mul(discount).div(subtotal).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const remaining = discount.minus(assigned);
    const share = roundedShare.gt(remaining) ? remaining : roundedShare;
    assigned = assigned.plus(share);
    return share;
  });
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

  return {
    listBatches,

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
      let saleId: string;
      try {
        saleId = await prisma.$transaction(async (transaction) => {
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
        const lineTotals = sortedItems.map((item, index) => {
          const variant = byId.get(item.productVariantId)!;
          return quantityCost(variant.currentSellingPrice, quantities[index], variant.product.kind);
        });
        const subtotal = lineTotals.reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0));
        const discount = asMoney(input.discountTotal);
        if (discount.gt(subtotal)) {
          throw inventoryError(400, "DISCOUNT_EXCEEDS_SUBTOTAL", "Discount cannot exceed subtotal.", {
            subtotal: Number(subtotal),
            discountTotal: Number(discount),
          });
        }
        const discounts = allocateDiscount(lineTotals, subtotal, discount);

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
        const grandTotal = subtotal.minus(discount);
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
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          subtotal,
          discountTotal: discount,
          grandTotal,
          totalBuyingCost,
          grossProfit,
          grossProfitMargin,
          unprofitableOverrideConfirmed: isUnprofitable,
          unprofitableOverrideByProfileId: isUnprofitable ? actorId : null,
          createdByProfileId: actorId,
          completedAt,
          paymentMethod: input.paymentMode === "CREDIT" ? "CREDIT" : "CASH",
          paymentStatus: input.paymentMode === "CREDIT" ? "UNPAID" : "PAID",
          nextFollowUpDate: input.paymentMode === "CREDIT" ? asDate(input.nextFollowUpDate!) : null,
        } });

        for (const [index, item] of sortedItems.entries()) {
          const variant = byId.get(item.productVariantId)!;
          const netLineRevenue = lineTotals[index].minus(discounts[index]);
          const orderItem = await transaction.salesOrderItem.create({ data: {
            salesOrderId: sale.id,
            productId: variant.product.id,
            productVariantId: variant.id,
            productNameSnapshot: variant.product.name,
            variantNameSnapshot: variant.name,
            skuSnapshot: variant.sku,
            quantity: quantities[index],
            quantityUnit: quantityUnitForKind(variant.product.kind),
            unitSellingPrice: variant.currentSellingPrice,
            grossLineRevenue: lineTotals[index],
            allocatedDiscount: discounts[index],
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
          action: "PHYSICAL_SALE_COMPLETED",
          entityType: "SALES_ORDER",
          entityId: sale.id,
          newData: {
            source: "PHYSICAL_SHOP",
            status: "COMPLETED",
            paymentMethod: input.paymentMode === "CREDIT" ? "CREDIT" : "CASH",
            paymentStatus: input.paymentMode === "CREDIT" ? "UNPAID" : "PAID",
            nextFollowUpDate: input.paymentMode === "CREDIT" ? input.nextFollowUpDate : null,
          },
        } });
        return sale.id;
        }, SERIALIZABLE_TRANSACTION_OPTIONS);
      } catch (error) {
        rethrowInventoryTransactionError(error);
      }

      return readSale(saleId);
    },

    async returnPhysicalSale(id: string, input: PhysicalSaleReturnInput, actorId: string) {
      try {
        await prisma.$transaction(async (transaction) => {
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
          const creditBeforeReturn = activeCreditTotal(sale);
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

          if (sale.paymentMethod === "CREDIT") {
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
            newData: { amount: amount.toString(), paidOn: input.paidOn, note: input.note ?? null },
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
