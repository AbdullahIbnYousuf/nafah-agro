import { z } from "zod";

const uuid = z.string().uuid();
const positiveQuantity = z.number().int().min(1).max(1_000_000);
const money = z.string().regex(/^\d+(?:\.\d{1,2})?$/);
const positiveMoney = money.refine((value) => Number(value) > 0, "Buying cost must be greater than zero");
const nonNegativeMoney = money.refine((value) => Number(value) >= 0);
const reason = z.string().trim().min(3).max(500);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Purchase date must be a valid YYYY-MM-DD date");

function uniqueVariantIds(
  value: { items: Array<{ productVariantId: string }> },
  context: z.RefinementCtx,
) {
  const ids = value.items.map((item) => item.productVariantId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["items"], message: "Each variant may appear only once" });
  }
}

export const purchaseCreateSchema = z.object({
  purchaseDate: dateOnly,
  note: z.string().trim().max(1_000).optional(),
  items: z.array(z.object({
    productVariantId: uuid,
    quantity: positiveQuantity,
    unitBuyingCost: positiveMoney,
  }).strict()).min(1).max(100),
}).strict().superRefine(uniqueVariantIds);

const adjustmentBase = {
  productVariantId: uuid,
  quantity: positiveQuantity,
  reason,
};

export const stockAdjustmentSchema = z.discriminatedUnion("direction", [
  z.object({
    ...adjustmentBase,
    direction: z.literal("INCREASE"),
    unitBuyingCost: positiveMoney,
    purchaseDate: dateOnly,
  }).strict(),
  z.object({
    ...adjustmentBase,
    direction: z.literal("DECREASE"),
  }).strict(),
]);

export const stockBatchListSchema = z.object({
  productVariantId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
}).strict();

export const physicalSaleCreateSchema = z.object({
  items: z.array(z.object({
    productVariantId: uuid,
    quantity: positiveQuantity,
  }).strict()).min(1).max(100),
  customerName: z.string().trim().min(1).max(120).optional(),
  customerPhone: z.string().trim().min(7).max(30).optional(),
  discountTotal: nonNegativeMoney.default("0"),
  confirmUnprofitable: z.boolean().default(false),
}).strict().superRefine(uniqueVariantIds);

export const physicalSaleListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
}).strict();

export type PurchaseCreate = z.infer<typeof purchaseCreateSchema>;
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
export type StockBatchList = z.infer<typeof stockBatchListSchema>;
export type PhysicalSaleCreate = z.infer<typeof physicalSaleCreateSchema>;
export type PhysicalSaleList = z.infer<typeof physicalSaleListSchema>;
