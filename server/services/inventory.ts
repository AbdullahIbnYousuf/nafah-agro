import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import type {
  PhysicalSaleCreate,
  PhysicalSaleList,
  PurchaseCreate,
  StockAdjustmentInput,
  StockBatchList,
} from "../schemas/inventory.js";

interface LockedBatch {
  id: string;
  availableQuantity: number;
  unitBuyingCost: Prisma.Decimal;
  purchaseDate: Date;
  createdAt: Date;
}

interface FifoAllocation {
  stockBatchId: string;
  quantity: number;
  unitBuyingCost: Prisma.Decimal;
  totalBuyingCost: Prisma.Decimal;
}

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
  throw error;
}

const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const asMoney = (value: string | number | Prisma.Decimal) => new Prisma.Decimal(value);
const moneyNumber = (value: Prisma.Decimal | null) => value === null ? null : Number(value);

const saleInclude = {
  createdBy: { select: { fullName: true, role: true } },
  items: {
    orderBy: { createdAt: "asc" },
    include: {
      allocations: {
        orderBy: { createdAt: "asc" },
        include: { stockBatch: { select: { purchaseDate: true } } },
      },
    },
  },
} satisfies Prisma.SalesOrderInclude;

type SaleRecord = Prisma.SalesOrderGetPayload<{ include: typeof saleInclude }>;

function saleDto(sale: SaleRecord) {
  return {
    id: sale.id,
    orderNumber: sale.orderNumber,
    source: sale.source,
    status: sale.status,
    paymentMethod: sale.paymentMethod,
    paymentStatus: sale.paymentStatus,
    customerName: sale.customerName,
    customerPhone: sale.customerPhone,
    subtotal: moneyNumber(sale.subtotal),
    discountTotal: moneyNumber(sale.discountTotal),
    grandTotal: moneyNumber(sale.grandTotal),
    totalBuyingCost: moneyNumber(sale.totalBuyingCost),
    grossProfit: moneyNumber(sale.grossProfit),
    grossProfitMargin: moneyNumber(sale.grossProfitMargin),
    unprofitableOverrideConfirmed: sale.unprofitableOverrideConfirmed,
    createdBy: sale.createdBy,
    completedAt: sale.completedAt,
    items: sale.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productVariantId: item.productVariantId,
      productName: item.productNameSnapshot,
      variantName: item.variantNameSnapshot,
      sku: item.skuSnapshot,
      quantity: item.quantity,
      unitSellingPrice: moneyNumber(item.unitSellingPrice),
      grossLineRevenue: moneyNumber(item.grossLineRevenue),
      allocatedDiscount: moneyNumber(item.allocatedDiscount),
      netLineRevenue: moneyNumber(item.netLineRevenue),
      totalBuyingCost: moneyNumber(item.totalBuyingCost),
      grossProfit: moneyNumber(item.grossProfit),
      allocations: item.allocations.map((allocation) => ({
        id: allocation.id,
        stockBatchId: allocation.stockBatchId,
        quantity: allocation.quantity,
        unitBuyingCost: moneyNumber(allocation.unitBuyingCost),
        totalBuyingCost: moneyNumber(allocation.totalBuyingCost),
        state: allocation.state,
        purchaseDate: allocation.stockBatch.purchaseDate,
      })),
    })),
  };
}

async function lockAvailableBatches(
  transaction: Prisma.TransactionClient,
  productVariantId: string,
): Promise<LockedBatch[]> {
  return transaction.$queryRaw<LockedBatch[]>(Prisma.sql`
    SELECT
      "id",
      "available_quantity" AS "availableQuantity",
      "unit_buying_cost" AS "unitBuyingCost",
      "purchase_date" AS "purchaseDate",
      "created_at" AS "createdAt"
    FROM "stock_batches"
    WHERE "product_variant_id" = ${productVariantId}::uuid
      AND "available_quantity" > 0
    ORDER BY "purchase_date" ASC, "created_at" ASC, "id" ASC
    FOR UPDATE
  `);
}

async function consumeFifo(
  transaction: Prisma.TransactionClient,
  productVariantId: string,
  requestedQuantity: number,
): Promise<FifoAllocation[]> {
  const batches = await lockAvailableBatches(transaction, productVariantId);
  const available = batches.reduce((sum, batch) => sum + batch.availableQuantity, 0);
  if (available < requestedQuantity) {
    throw inventoryError(409, "INSUFFICIENT_STOCK", "The requested quantity is not available.", {
      productVariantId,
      requestedQuantity,
      availableQuantity: available,
    });
  }

  let remaining = requestedQuantity;
  const allocations: FifoAllocation[] = [];
  for (const batch of batches) {
    if (remaining === 0) break;
    const quantity = Math.min(batch.availableQuantity, remaining);
    const updated = await transaction.stockBatch.updateMany({
      where: { id: batch.id, availableQuantity: { gte: quantity } },
      data: { availableQuantity: { decrement: quantity } },
    });
    if (updated.count !== 1) {
      throw inventoryError(409, "STOCK_CONFLICT", "Stock changed during allocation. Please retry.");
    }
    allocations.push({
      stockBatchId: batch.id,
      quantity,
      unitBuyingCost: batch.unitBuyingCost,
      totalBuyingCost: batch.unitBuyingCost.mul(quantity),
    });
    remaining -= quantity;
  }

  const variantUpdated = await transaction.productVariant.updateMany({
    where: { id: productVariantId, availableStock: { gte: requestedQuantity } },
    data: { availableStock: { decrement: requestedQuantity } },
  });
  if (variantUpdated.count !== 1) {
    throw inventoryError(409, "STOCK_TOTAL_MISMATCH", "Variant stock totals do not match FIFO batches.");
  }
  return allocations;
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
    productVariant: { include: { product: { select: { name: true } } } };
    createdBy: { select: { fullName: true; role: true } };
  };
}>) {
  return {
    id: batch.id,
    purchaseGroupId: batch.purchaseGroupId,
    productVariantId: batch.productVariantId,
    productName: batch.productVariant.product.name,
    variantName: batch.productVariant.name,
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
    productVariant: { include: { product: { select: { name: true } } } },
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
          where: { id: { in: variantIds } },
          select: { id: true },
        });
        if (variants.length !== variantIds.length) {
          throw inventoryError(404, "VARIANT_NOT_FOUND", "One or more purchase variants were not found.");
        }
        const ids: string[] = [];
        for (const item of input.items) {
          const batch = await transaction.stockBatch.create({ data: {
            purchaseGroupId,
            productVariantId: item.productVariantId,
            source: "PURCHASE",
            purchasedQuantity: item.quantity,
            availableQuantity: item.quantity,
            unitBuyingCost: item.unitBuyingCost,
            purchaseDate: asDate(input.purchaseDate),
            note: input.note,
            createdByProfileId: actorId,
          } });
          await transaction.productVariant.update({
            where: { id: item.productVariantId },
            data: { availableStock: { increment: item.quantity } },
          });
          ids.push(batch.id);
        }
        return ids;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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
          select: { id: true },
        });
        if (!variant) throw inventoryError(404, "VARIANT_NOT_FOUND", "Variant not found.");

        if (input.direction === "INCREASE") {
          await transaction.stockBatch.create({ data: {
            productVariantId: input.productVariantId,
            source: "ADJUSTMENT",
            purchasedQuantity: input.quantity,
            availableQuantity: input.quantity,
            unitBuyingCost: input.unitBuyingCost,
            purchaseDate: asDate(input.purchaseDate),
            adjustmentReason: input.reason,
            createdByProfileId: actorId,
          } });
          await transaction.productVariant.update({
            where: { id: input.productVariantId },
            data: { availableStock: { increment: input.quantity } },
          });
        } else {
          await consumeFifo(transaction, input.productVariantId, input.quantity);
        }

        await transaction.stockAdjustment.create({ data: {
          productVariantId: input.productVariantId,
          direction: input.direction,
          quantity: input.quantity,
          unitBuyingCost: input.direction === "INCREASE" ? input.unitBuyingCost : null,
          reason: input.reason,
          createdByProfileId: actorId,
        } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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
          include: { product: { select: { id: true, name: true, isActive: true } } },
        });
        if (variants.length !== sortedItems.length || variants.some((variant) => !variant.product.isActive)) {
          throw inventoryError(404, "SELLABLE_VARIANT_NOT_FOUND", "One or more variants are inactive or missing.");
        }
        const byId = new Map(variants.map((variant) => [variant.id, variant]));
        const lineTotals = sortedItems.map((item) =>
          asMoney(byId.get(item.productVariantId)!.currentSellingPrice).mul(item.quantity));
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
        for (const item of sortedItems) {
          fifoByVariant.set(
            item.productVariantId,
            await consumeFifo(transaction, item.productVariantId, item.quantity),
          );
        }

        const lineCosts = sortedItems.map((item) =>
          fifoByVariant.get(item.productVariantId)!.reduce(
            (sum, allocation) => sum.plus(allocation.totalBuyingCost),
            new Prisma.Decimal(0),
          ));
        const totalBuyingCost = lineCosts.reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0));
        const grandTotal = subtotal.minus(discount);
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
            quantity: item.quantity,
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
        return sale.id;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        rethrowInventoryTransactionError(error);
      }

      return readSale(saleId);
    },

    async listPhysicalSales(input: PhysicalSaleList) {
      const sales = await prisma.salesOrder.findMany({
        include: saleInclude,
        orderBy: { completedAt: "desc" },
        take: input.limit,
      });
      return sales.map(saleDto);
    },
  };
}

export type InventoryService = ReturnType<typeof createInventoryService>;
