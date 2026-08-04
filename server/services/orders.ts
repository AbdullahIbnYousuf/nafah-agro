import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import type {
  DeliveryRateUpdate,
  ManualDeliveryOrder,
  OrderLifecycle,
  OrderList,
  WebsiteCheckout,
} from "../schemas/orders.js";
import { reserveAvailableFifo, stockError, type FifoAllocation } from "./stockAllocation.js";

const orderInclude = {
  createdBy: { select: { fullName: true, role: true } },
  customerProfile: { select: { id: true, fullName: true } },
  deliveryRate: { select: { id: true, code: true, name: true, charge: true } },
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

type OrderRecord = Prisma.SalesOrderGetPayload<{ include: typeof orderInclude }>;

const money = (value: string | number | Prisma.Decimal) => new Prisma.Decimal(value);
const moneyNumber = (value: Prisma.Decimal | null) => value === null ? null : Number(value);

function orderError(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
  return Object.assign(new Error(message), { status, code, details });
}

function transactionError(error: unknown): never {
  if (error && typeof error === "object" && (error as { code?: unknown }).code === "P2034") {
    throw orderError(409, "STOCK_CONFLICT", "Order stock changed concurrently. Please retry.");
  }
  throw error;
}

function orderDto(order: OrderRecord) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    source: order.source,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    customerProfileId: order.customerProfileId,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerEmail: order.customerEmail,
    customerAddress: order.customerAddress,
    deliveryRate: order.deliveryRate && {
      ...order.deliveryRate,
      charge: moneyNumber(order.deliveryRate.charge),
    },
    subtotal: moneyNumber(order.subtotal),
    discountTotal: moneyNumber(order.discountTotal),
    deliveryCharge: moneyNumber(order.deliveryCharge),
    grandTotal: moneyNumber(order.grandTotal),
    totalBuyingCost: moneyNumber(order.totalBuyingCost),
    grossProfit: moneyNumber(order.grossProfit),
    grossProfitMargin: moneyNumber(order.grossProfitMargin),
    unprofitableOverrideConfirmed: order.unprofitableOverrideConfirmed,
    createdBy: order.createdBy,
    placedAt: order.placedAt,
    confirmedAt: order.confirmedAt,
    completedAt: order.completedAt,
    deliveredAt: order.deliveredAt,
    cancelledAt: order.cancelledAt,
    returnedAt: order.returnedAt,
    statusReason: order.statusReason,
    returnCondition: order.returnCondition,
    items: order.items.map((item) => ({
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

function allocateDiscount(lineTotals: Prisma.Decimal[], subtotal: Prisma.Decimal, discount: Prisma.Decimal) {
  if (discount.isZero()) return lineTotals.map(() => new Prisma.Decimal(0));
  let assigned = new Prisma.Decimal(0);
  return lineTotals.map((lineTotal, index) => {
    if (index === lineTotals.length - 1) return discount.minus(assigned);
    const rounded = lineTotal.mul(discount).div(subtotal).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const remaining = discount.minus(assigned);
    const share = rounded.gt(remaining) ? remaining : rounded;
    assigned = assigned.plus(share);
    return share;
  });
}

function fingerprint(input: WebsiteCheckout) {
  const canonical = {
    items: [...input.items].sort((a, b) => a.productVariantId.localeCompare(b.productVariantId)),
    customer: input.customer,
    deliveryRateId: input.deliveryRateId,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function orderNumber(prefix: string) {
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `${prefix}-${day}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function writeAudit(
  transaction: Prisma.TransactionClient,
  input: {
    actorProfileId?: string;
    action: string;
    entityId: string;
    previousData?: Prisma.InputJsonObject;
    newData?: Prisma.InputJsonObject;
    reason?: string;
  },
) {
  return transaction.auditLog.create({ data: {
    actorProfileId: input.actorProfileId,
    action: input.action,
    entityType: "SALES_ORDER",
    entityId: input.entityId,
    previousData: input.previousData,
    newData: input.newData,
    reason: input.reason,
  } });
}

async function loadDeliveryRate(transaction: Prisma.TransactionClient, id: string) {
  const rate = await transaction.deliveryRate.findFirst({ where: { id, isActive: true } });
  if (!rate) throw orderError(404, "DELIVERY_RATE_NOT_FOUND", "The selected delivery rate is inactive or missing.");
  const charge = rate.charge;
  if (charge === null) {
    throw orderError(409, "DELIVERY_RATE_NOT_CONFIGURED", "The selected delivery charge has not been approved yet.");
  }
  return { ...rate, charge };
}

async function createOrderBase(
  transaction: Prisma.TransactionClient,
  input: {
    source: "WEBSITE" | "FACEBOOK" | "PHONE" | "WHATSAPP" | "OTHER";
    items: Array<{ productVariantId: string; quantity: number }>;
    customer: { name: string; phone: string; email?: string; address: string };
    deliveryRateId: string;
    discountTotal: string;
    customerProfileId?: string;
    createdByProfileId?: string;
    idempotencyKey?: string;
    requestFingerprint?: string;
  },
) {
  const sortedItems = [...input.items].sort((a, b) => a.productVariantId.localeCompare(b.productVariantId));
  const variants = await transaction.productVariant.findMany({
    where: { id: { in: sortedItems.map((item) => item.productVariantId) }, isActive: true },
    include: { product: { select: { id: true, name: true, isActive: true } } },
  });
  if (variants.length !== sortedItems.length || variants.some((variant) => !variant.product.isActive)) {
    throw orderError(404, "SELLABLE_VARIANT_NOT_FOUND", "One or more variants are inactive or missing.");
  }
  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  const lineTotals = sortedItems.map((item) => money(byId.get(item.productVariantId)!.currentSellingPrice).mul(item.quantity));
  const subtotal = lineTotals.reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0));
  const discount = money(input.discountTotal);
  if (discount.gt(subtotal)) throw orderError(400, "DISCOUNT_EXCEEDS_SUBTOTAL", "Discount cannot exceed subtotal.");
  const discounts = allocateDiscount(lineTotals, subtotal, discount);
  const rate = await loadDeliveryRate(transaction, input.deliveryRateId);
  const placedAt = new Date();
  const order = await transaction.salesOrder.create({ data: {
    orderNumber: orderNumber(input.source === "WEBSITE" ? "WEB" : "MAN"),
    idempotencyKey: input.idempotencyKey,
    requestFingerprint: input.requestFingerprint,
    source: input.source,
    status: "PENDING",
    paymentMethod: "CASH_ON_DELIVERY",
    paymentStatus: "UNPAID",
    customerProfileId: input.customerProfileId,
    customerName: input.customer.name,
    customerPhone: input.customer.phone,
    customerEmail: input.customer.email,
    customerAddress: input.customer.address,
    deliveryRateId: rate.id,
    deliveryCharge: rate.charge,
    subtotal,
    discountTotal: discount,
    grandTotal: subtotal.minus(discount).plus(rate.charge),
    totalBuyingCost: null,
    grossProfit: null,
    grossProfitMargin: null,
    createdByProfileId: input.createdByProfileId,
    placedAt,
    completedAt: null,
  } });
  for (const [index, item] of sortedItems.entries()) {
    const variant = byId.get(item.productVariantId)!;
    await transaction.salesOrderItem.create({ data: {
      salesOrderId: order.id,
      productId: variant.product.id,
      productVariantId: variant.id,
      productNameSnapshot: variant.product.name,
      variantNameSnapshot: variant.name,
      skuSnapshot: variant.sku,
      quantity: item.quantity,
      unitSellingPrice: variant.currentSellingPrice,
      grossLineRevenue: lineTotals[index],
      allocatedDiscount: discounts[index],
      netLineRevenue: lineTotals[index].minus(discounts[index]),
      totalBuyingCost: null,
      grossProfit: null,
    } });
  }
  return order.id;
}

async function lockOrder(transaction: Prisma.TransactionClient, id: string) {
  const locked = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "sales_orders" WHERE "id" = ${id}::uuid FOR UPDATE
  `);
  if (locked.length === 0) throw orderError(404, "ORDER_NOT_FOUND", "Order not found.");
  const order = await transaction.salesOrder.findUnique({
    where: { id },
    include: { items: { include: { allocations: true } } },
  });
  if (!order) throw orderError(404, "ORDER_NOT_FOUND", "Order not found.");
  return order;
}

async function reserveOrder(
  transaction: Prisma.TransactionClient,
  orderId: string,
  actorId: string,
  confirmUnprofitable: boolean,
) {
  const order = await lockOrder(transaction, orderId);
  if (order.status !== "PENDING") throw orderError(409, "INVALID_ORDER_STATUS", "Only a pending order can be confirmed.");
  const sortedItems = [...order.items].sort((a, b) => a.productVariantId.localeCompare(b.productVariantId));
  const fifoByItem = new Map<string, FifoAllocation[]>();
  for (const item of sortedItems) {
    fifoByItem.set(item.id, await reserveAvailableFifo(transaction, item.productVariantId, item.quantity));
  }
  const lineCosts = sortedItems.map((item) => fifoByItem.get(item.id)!.reduce(
    (sum, allocation) => sum.plus(allocation.totalBuyingCost), new Prisma.Decimal(0),
  ));
  const totalBuyingCost = lineCosts.reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0));
  const productRevenue = order.subtotal.minus(order.discountTotal);
  const grossProfit = productRevenue.minus(totalBuyingCost);
  const unprofitable = grossProfit.isNegative();
  if (unprofitable && !confirmUnprofitable) {
    throw orderError(409, "UNPROFITABLE_ORDER_CONFIRMATION_REQUIRED", "This order is projected to be unprofitable.", {
      productRevenue: Number(productRevenue), totalBuyingCost: Number(totalBuyingCost), projectedGrossProfit: Number(grossProfit),
    });
  }
  const margin = productRevenue.isZero() ? null : grossProfit.div(productRevenue).mul(100).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
  const confirmedAt = new Date();
  for (const [index, item] of sortedItems.entries()) {
    await transaction.salesOrderItem.update({
      where: { id: item.id },
      data: { totalBuyingCost: lineCosts[index], grossProfit: item.netLineRevenue.minus(lineCosts[index]) },
    });
    for (const allocation of fifoByItem.get(item.id)!) {
      await transaction.orderAllocation.create({ data: {
        salesOrderItemId: item.id,
        stockBatchId: allocation.stockBatchId,
        quantity: allocation.quantity,
        unitBuyingCost: allocation.unitBuyingCost,
        totalBuyingCost: allocation.totalBuyingCost,
        state: "RESERVED",
        reservedAt: confirmedAt,
      } });
    }
  }
  await transaction.salesOrder.update({
    where: { id: order.id },
    data: {
      status: "CONFIRMED", confirmedAt, totalBuyingCost, grossProfit, grossProfitMargin: margin,
      unprofitableOverrideConfirmed: unprofitable,
      unprofitableOverrideByProfileId: unprofitable ? actorId : null,
      statusReason: null,
    },
  });
}

export function createUnifiedOrderService(prisma: PrismaClient) {
  async function readOrder(id: string) {
    const order = await prisma.salesOrder.findUnique({ where: { id }, include: orderInclude });
    if (!order) throw orderError(404, "ORDER_NOT_FOUND", "Order not found.");
    return orderDto(order);
  }

  return {
    async listDeliveryRates(includeInactive = false) {
      const rates = await prisma.deliveryRate.findMany({
        where: includeInactive ? undefined : { isActive: true },
        select: { id: true, code: true, name: true, charge: true, isActive: true },
        orderBy: { code: "asc" },
      });
      return rates.map((rate) => ({ ...rate, charge: moneyNumber(rate.charge) }));
    },

    async updateDeliveryRate(id: string, input: DeliveryRateUpdate, actorId: string) {
      const rate = await prisma.$transaction(async (transaction) => {
        const updated = await transaction.deliveryRate.update({
          where: { id }, data: { ...input, updatedByProfileId: actorId },
        });
        await transaction.auditLog.create({ data: {
          actorProfileId: actorId, action: "DELIVERY_RATE_UPDATED",
          entityType: "DELIVERY_RATE", entityId: id,
          newData: { name: updated.name, charge: updated.charge?.toString() ?? null, isActive: updated.isActive },
        } });
        return updated;
      });
      return { ...rate, charge: moneyNumber(rate.charge) };
    },

    async createWebsiteOrder(input: WebsiteCheckout, customerProfileId?: string) {
      const requestFingerprint = fingerprint(input);
      const existing = await prisma.salesOrder.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: orderInclude });
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) {
          throw orderError(409, "IDEMPOTENCY_KEY_REUSED", "This idempotency key was already used for a different order.");
        }
        return { order: orderDto(existing), replayed: true };
      }

      try {
        const id = await prisma.$transaction(async (transaction) => {
          const orderId = await createOrderBase(transaction, {
            source: "WEBSITE", items: input.items, customer: input.customer,
            deliveryRateId: input.deliveryRateId, discountTotal: "0", customerProfileId,
            idempotencyKey: input.idempotencyKey, requestFingerprint,
          });
          await writeAudit(transaction, {
            actorProfileId: customerProfileId, action: "WEBSITE_ORDER_CREATED", entityId: orderId,
            newData: { source: "WEBSITE", status: "PENDING" },
          });
          return orderId;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return { order: await readOrder(id), replayed: false };
      } catch (error) {
        if (error && typeof error === "object" && (error as { code?: unknown }).code === "P2002") {
          const raced = await prisma.salesOrder.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: orderInclude });
          if (raced?.requestFingerprint === requestFingerprint) return { order: orderDto(raced), replayed: true };
          throw orderError(409, "IDEMPOTENCY_KEY_REUSED", "This idempotency key was already used for a different order.");
        }
        transactionError(error);
      }
    },

    async createManualOrder(input: ManualDeliveryOrder, actorId: string) {
      let id: string;
      try {
        id = await prisma.$transaction(async (transaction) => {
          const orderId = await createOrderBase(transaction, {
            source: input.source, items: input.items, customer: input.customer,
            deliveryRateId: input.deliveryRateId, discountTotal: input.discountTotal,
            createdByProfileId: actorId,
          });
          if (input.initialStatus === "CONFIRMED") {
            await reserveOrder(transaction, orderId, actorId, input.confirmUnprofitable);
          }
          await writeAudit(transaction, {
            actorProfileId: actorId, action: "MANUAL_ORDER_CREATED", entityId: orderId,
            newData: { source: input.source, status: input.initialStatus },
          });
          return orderId;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) { transactionError(error); }
      return readOrder(id);
    },

    async listOrders(input: OrderList) {
      const where: Prisma.SalesOrderWhereInput = {
        ...(input.source ? { source: input.source } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.orderNumber ? { orderNumber: { contains: input.orderNumber, mode: "insensitive" } } : {}),
        ...(input.phone ? { customerPhone: { contains: input.phone } } : {}),
        ...((input.dateFrom || input.dateTo) ? { placedAt: {
          ...(input.dateFrom ? { gte: new Date(input.dateFrom) } : {}),
          ...(input.dateTo ? { lte: new Date(input.dateTo) } : {}),
        } } : {}),
      };
      const orders = await prisma.salesOrder.findMany({
        where,
        include: orderInclude,
        orderBy: { placedAt: "desc" },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      });
      const total = await prisma.salesOrder.count({ where });
      return { data: orders.map(orderDto), total, page: input.page, limit: input.limit, totalPages: Math.ceil(total / input.limit) };
    },

    async listCustomerWebsiteOrders(profileId: string) {
      const orders = await prisma.salesOrder.findMany({
        where: { customerProfileId: profileId, source: "WEBSITE" }, include: orderInclude, orderBy: { placedAt: "desc" },
      });
      return orders.map(orderDto);
    },

    async transitionOrder(id: string, input: OrderLifecycle, actorId: string) {
      try {
        await prisma.$transaction(async (transaction) => {
          if (input.action === "CONFIRM") {
            await reserveOrder(transaction, id, actorId, input.confirmUnprofitable);
            await writeAudit(transaction, {
              actorProfileId: actorId, action: "ORDER_CONFIRMED", entityId: id,
              previousData: { status: "PENDING" }, newData: { status: "CONFIRMED" },
            });
            return;
          }
          const order = await lockOrder(transaction, id);
          if (input.action === "PROCESS") {
            if (order.status !== "CONFIRMED") throw orderError(409, "INVALID_ORDER_STATUS", "Only confirmed orders can enter processing.");
            await transaction.salesOrder.update({ where: { id }, data: { status: "PROCESSING" } });
            await writeAudit(transaction, {
              actorProfileId: actorId, action: "ORDER_PROCESSING", entityId: id,
              previousData: { status: order.status }, newData: { status: "PROCESSING" },
            });
            return;
          }
          if (input.action === "DELIVER") {
            if (order.status !== "CONFIRMED" && order.status !== "PROCESSING") {
              throw orderError(409, "INVALID_ORDER_STATUS", "Only confirmed or processing orders can be delivered.");
            }
            const deliveredAt = new Date();
            for (const item of order.items) {
              for (const allocation of item.allocations) {
                if (allocation.state !== "RESERVED") throw orderError(409, "ALLOCATION_STATE_INVALID", "Every delivery allocation must be reserved.");
                const batch = await transaction.stockBatch.updateMany({
                  where: { id: allocation.stockBatchId, reservedQuantity: { gte: allocation.quantity } },
                  data: { reservedQuantity: { decrement: allocation.quantity } },
                });
                const variant = await transaction.productVariant.updateMany({
                  where: { id: item.productVariantId, reservedStock: { gte: allocation.quantity } },
                  data: { reservedStock: { decrement: allocation.quantity } },
                });
                if (batch.count !== 1 || variant.count !== 1) throw stockError(409, "STOCK_TOTAL_MISMATCH", "Reserved stock totals are inconsistent.");
                await transaction.orderAllocation.update({ where: { id: allocation.id }, data: { state: "CONSUMED", consumedAt: deliveredAt } });
              }
            }
            await transaction.salesOrder.update({
              where: { id }, data: { status: "DELIVERED", paymentStatus: "PAID", deliveredAt, statusReason: null },
            });
            await writeAudit(transaction, {
              actorProfileId: actorId, action: "ORDER_DELIVERED", entityId: id,
              previousData: { status: order.status, paymentStatus: order.paymentStatus },
              newData: { status: "DELIVERED", paymentStatus: "PAID" },
            });
            return;
          }
          if (input.action === "CANCEL" || input.action === "FAILED_DELIVERY") {
            if (!["PENDING", "CONFIRMED", "PROCESSING"].includes(order.status)) {
              throw orderError(409, "INVALID_ORDER_STATUS", "This order cannot be cancelled.");
            }
            const cancelledAt = new Date();
            for (const item of order.items) {
              for (const allocation of item.allocations.filter((value) => value.state === "RESERVED")) {
                const batch = await transaction.stockBatch.updateMany({
                  where: { id: allocation.stockBatchId, reservedQuantity: { gte: allocation.quantity } },
                  data: { reservedQuantity: { decrement: allocation.quantity }, availableQuantity: { increment: allocation.quantity } },
                });
                const variant = await transaction.productVariant.updateMany({
                  where: { id: item.productVariantId, reservedStock: { gte: allocation.quantity } },
                  data: { reservedStock: { decrement: allocation.quantity }, availableStock: { increment: allocation.quantity } },
                });
                if (batch.count !== 1 || variant.count !== 1) throw stockError(409, "STOCK_TOTAL_MISMATCH", "Reserved stock totals are inconsistent.");
                await transaction.orderAllocation.update({ where: { id: allocation.id }, data: { state: "RELEASED", releasedAt: cancelledAt } });
              }
              await transaction.salesOrderItem.update({ where: { id: item.id }, data: { totalBuyingCost: null, grossProfit: null } });
            }
            await transaction.salesOrder.update({ where: { id }, data: {
              status: "CANCELLED", paymentStatus: "UNPAID", cancelledAt,
              statusReason: input.action === "FAILED_DELIVERY" ? `FAILED_DELIVERY: ${input.reason}` : input.reason,
              totalBuyingCost: null, grossProfit: null, grossProfitMargin: null,
              unprofitableOverrideConfirmed: false, unprofitableOverrideByProfileId: null,
            } });
            await writeAudit(transaction, {
              actorProfileId: actorId,
              action: input.action === "FAILED_DELIVERY" ? "ORDER_DELIVERY_FAILED" : "ORDER_CANCELLED",
              entityId: id, previousData: { status: order.status }, newData: { status: "CANCELLED" },
              reason: input.reason,
            });
            return;
          }
          if (input.action === "RETURN") {
            if (order.status !== "DELIVERED" && order.status !== "COMPLETED") {
              throw orderError(409, "INVALID_ORDER_STATUS", "Only a delivered or completed order can be returned.");
            }
            const returnedAt = new Date();
            if (input.condition === "SELLABLE") {
              for (const item of order.items) {
                for (const allocation of item.allocations) {
                  if (allocation.state !== "CONSUMED") throw orderError(409, "ALLOCATION_STATE_INVALID", "Returned stock must come from consumed allocations.");
                  await transaction.stockBatch.create({ data: {
                    productVariantId: item.productVariantId,
                    source: "SELLABLE_RETURN",
                    purchasedQuantity: allocation.quantity,
                    availableQuantity: allocation.quantity,
                    unitBuyingCost: allocation.unitBuyingCost,
                    purchaseDate: new Date(`${returnedAt.toISOString().slice(0, 10)}T00:00:00.000Z`),
                    note: input.reason,
                    sourceSalesOrderId: order.id,
                    createdByProfileId: actorId,
                  } });
                  await transaction.productVariant.update({
                    where: { id: item.productVariantId }, data: { availableStock: { increment: allocation.quantity } },
                  });
                }
              }
            }
            await transaction.salesOrder.update({ where: { id }, data: {
              status: input.condition === "SELLABLE" ? "RETURNED_SELLABLE" : "RETURNED_DAMAGED",
              paymentStatus: "REFUNDED", returnedAt, returnCondition: input.condition, statusReason: input.reason,
            } });
            await writeAudit(transaction, {
              actorProfileId: actorId, action: "ORDER_RETURNED", entityId: id,
              previousData: { status: order.status, paymentStatus: order.paymentStatus },
              newData: {
                status: input.condition === "SELLABLE" ? "RETURNED_SELLABLE" : "RETURNED_DAMAGED",
                paymentStatus: "REFUNDED", condition: input.condition,
              },
              reason: input.reason,
            });
          }
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) { transactionError(error); }
      return readOrder(id);
    },
  };
}

export type UnifiedOrderService = ReturnType<typeof createUnifiedOrderService>;
