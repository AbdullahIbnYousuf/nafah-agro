import { Prisma } from "../generated/prisma/client.js";

interface LockedBatch {
  id: string;
  availableQuantity: number;
  unitBuyingCost: Prisma.Decimal;
}

export interface FifoAllocation {
  stockBatchId: string;
  quantity: number;
  unitBuyingCost: Prisma.Decimal;
  totalBuyingCost: Prisma.Decimal;
}

export function stockError(
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
) {
  return Object.assign(new Error(message), { status, code, details });
}

async function lockAvailableBatches(
  transaction: Prisma.TransactionClient,
  productVariantId: string,
) {
  return transaction.$queryRaw<LockedBatch[]>(Prisma.sql`
    SELECT
      "id",
      "available_quantity" AS "availableQuantity",
      "unit_buying_cost" AS "unitBuyingCost"
    FROM "stock_batches"
    WHERE "product_variant_id" = ${productVariantId}::uuid
      AND "available_quantity" > 0
    ORDER BY "purchase_date" ASC, "created_at" ASC, "id" ASC
    FOR UPDATE
  `);
}

async function allocateAvailableFifo(
  transaction: Prisma.TransactionClient,
  productVariantId: string,
  requestedQuantity: number,
  reserve: boolean,
): Promise<FifoAllocation[]> {
  const batches = await lockAvailableBatches(transaction, productVariantId);
  const available = batches.reduce((sum, batch) => sum + batch.availableQuantity, 0);
  if (available < requestedQuantity) {
    throw stockError(409, "INSUFFICIENT_STOCK", "The requested quantity is not available.", {
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
      data: reserve
        ? { availableQuantity: { decrement: quantity }, reservedQuantity: { increment: quantity } }
        : { availableQuantity: { decrement: quantity } },
    });
    if (updated.count !== 1) throw stockError(409, "STOCK_CONFLICT", "Stock changed during allocation. Please retry.");
    allocations.push({
      stockBatchId: batch.id,
      quantity,
      unitBuyingCost: batch.unitBuyingCost,
      totalBuyingCost: batch.unitBuyingCost.mul(quantity),
    });
    remaining -= quantity;
  }

  const updatedVariant = await transaction.productVariant.updateMany({
    where: { id: productVariantId, availableStock: { gte: requestedQuantity } },
    data: reserve
      ? { availableStock: { decrement: requestedQuantity }, reservedStock: { increment: requestedQuantity } }
      : { availableStock: { decrement: requestedQuantity } },
  });
  if (updatedVariant.count !== 1) {
    throw stockError(409, "STOCK_TOTAL_MISMATCH", "Variant stock totals do not match FIFO batches.");
  }
  return allocations;
}

export function consumeAvailableFifo(
  transaction: Prisma.TransactionClient,
  productVariantId: string,
  quantity: number,
) {
  return allocateAvailableFifo(transaction, productVariantId, quantity, false);
}

export function reserveAvailableFifo(
  transaction: Prisma.TransactionClient,
  productVariantId: string,
  quantity: number,
) {
  return allocateAvailableFifo(transaction, productVariantId, quantity, true);
}
