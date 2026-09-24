import { z } from "zod";

const uuid = z.string().uuid();
const amount = z.string().regex(/^\d+(?:\.\d{1,3})?$/).refine((value) => Number(value) > 0);
const nonNegativeAmount = z.string().regex(/^\d+(?:\.\d{1,3})?$/);
const amountUnit = z.enum(["PIECE", "KG", "G", "LITER", "ML"]);
const money = z.string().regex(/^\d+(?:\.\d{1,2})?$/);
const positiveMoney = money.refine((value) => Number(value) > 0, "Buying cost must be greater than zero");
const nonNegativeMoney = money.refine((value) => Number(value) >= 0);
const reason = z.string().trim().min(3).max(500);
const optionalReason = (fallback: string) => z.string().trim().max(500).optional()
  .transform((value) => value || fallback);
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
    amount,
    amountUnit,
    unitBuyingCost: positiveMoney,
  }).strict()).min(1).max(100),
}).strict().superRefine(uniqueVariantIds);

const adjustmentBase = {
  productVariantId: uuid,
  amount,
  amountUnit,
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

export const stockLossSchema = z.object({
  productVariantId: uuid,
  amount,
  amountUnit,
  note: z.string().trim().max(1_000).optional(),
}).strict();

export const stockReconciliationSchema = z.object({
  productVariantId: uuid,
  actualAmount: nonNegativeAmount,
  amountUnit,
  note: z.string().trim().max(1_000).optional(),
}).strict();

export const stockBatchCorrectionSchema = z.object({
  correctedAmount: nonNegativeAmount,
  amountUnit,
  unitBuyingCost: positiveMoney,
}).strict();

export const stockBatchListSchema = z.object({
  productVariantId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
}).strict();

export const inventoryItemListSchema = z.object({
  query: z.string().trim().max(120).optional(),
  categoryId: uuid.optional(),
  status: z.enum(["ALL", "IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "INACTIVE"]).default("ALL"),
  sort: z.enum(["URGENCY", "NAME", "STOCK_ASC", "LAST_ADDED"]).default("URGENCY"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
}).strict();

export const inventoryItemBatchListSchema = z.object({
  includeDepleted: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export const inventoryRecordListSchema = z.object({
  query: z.string().trim().max(120).optional(),
  type: z.enum(["ALL", "PURCHASE", "ADJUSTMENT", "STOCK_LOSS", "ENTRY_CORRECTION", "STOCK_RECONCILIATION"]).default("ALL"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export const physicalSaleCreateSchema = z.object({
  items: z.array(z.object({
    productVariantId: uuid,
    amount,
    amountUnit,
  }).strict()).min(1).max(100),
  customerName: z.string().trim().min(1).max(120).optional(),
  customerPhone: z.string().trim().min(7).max(30).optional(),
  creditCustomerId: uuid.optional(),
  createCreditCustomer: z.boolean().default(false),
  discountTotal: nonNegativeMoney.default("0"),
  paymentMode: z.enum(["PAID_NOW", "CREDIT"]).default("PAID_NOW"),
  nextFollowUpDate: dateOnly.optional(),
  confirmUnprofitable: z.boolean().default(false),
}).strict().superRefine((value, context) => {
  uniqueVariantIds(value, context);
  if (value.paymentMode !== "CREDIT") {
    if (value.nextFollowUpDate) {
      context.addIssue({ code: "custom", path: ["nextFollowUpDate"], message: "Paid sales cannot have a credit follow-up date" });
    }
    return;
  }
  if (value.creditCustomerId && value.createCreditCustomer) {
    context.addIssue({ code: "custom", path: ["createCreditCustomer"], message: "An existing customer cannot also be created again" });
  }
  if (value.createCreditCustomer && !value.customerName) {
    context.addIssue({ code: "custom", path: ["customerName"], message: "Customer name is required for a credit sale" });
  }
  if (!value.nextFollowUpDate) {
    context.addIssue({ code: "custom", path: ["nextFollowUpDate"], message: "Follow-up date is required for a credit sale" });
  }
});

export const physicalSaleListSchema = z.object({
  product: z.string().trim().max(120).optional(),
  query: z.string().trim().max(120).optional(),
  dateFrom: dateOnly.optional(),
  dateTo: dateOnly.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
}).strict().superRefine((value, context) => {
  if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
    context.addIssue({ code: "custom", path: ["dateTo"], message: "End date cannot be before start date" });
  }
});

export const physicalSaleReturnSchema = z.object({
  condition: z.enum(["SELLABLE", "DAMAGED"]),
  reason: optionalReason("দোকানের বিক্রি রিটার্ন"),
  items: z.array(z.object({
    salesOrderItemId: uuid,
    amount,
    amountUnit,
  }).strict()).min(1).max(100),
}).strict().superRefine((value, context) => {
  const ids = value.items.map((item) => item.salesOrderItemId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["items"], message: "Each sold item may appear only once" });
  }
});

export const creditSaleListSchema = z.object({
  state: z.enum(["OPEN", "OVERDUE", "TODAY", "UPCOMING", "SETTLED", "ALL"]).default("OPEN"),
  query: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
}).strict();

export const creditCustomerSuggestionSchema = z.object({
  query: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(20).default(8),
}).strict();

export const creditCustomerListSchema = creditSaleListSchema;

export const creditCustomerUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(7).max(30).nullable().optional(),
}).strict();

export const creditPaymentCreateSchema = z.object({
  idempotencyKey: uuid,
  amount: positiveMoney,
  paidOn: dateOnly,
  note: z.string().trim().max(1_000).optional(),
}).strict();

export const creditPaymentVoidSchema = z.object({ reason }).strict();

export const creditFollowUpSchema = z.object({
  nextFollowUpDate: dateOnly,
  note: z.string().trim().max(1_000).optional(),
}).strict();

export type PurchaseCreate = z.infer<typeof purchaseCreateSchema>;
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
export type StockLossInput = z.infer<typeof stockLossSchema>;
export type StockReconciliationInput = z.infer<typeof stockReconciliationSchema>;
export type StockBatchCorrectionInput = z.infer<typeof stockBatchCorrectionSchema>;
export type StockBatchList = z.infer<typeof stockBatchListSchema>;
export type InventoryItemList = z.infer<typeof inventoryItemListSchema>;
export type InventoryItemBatchList = z.infer<typeof inventoryItemBatchListSchema>;
export type InventoryRecordList = z.infer<typeof inventoryRecordListSchema>;
export type PhysicalSaleCreate = z.infer<typeof physicalSaleCreateSchema>;
export type PhysicalSaleList = z.infer<typeof physicalSaleListSchema>;
export type PhysicalSaleReturnInput = z.infer<typeof physicalSaleReturnSchema>;
export type CreditSaleList = z.infer<typeof creditSaleListSchema>;
export type CreditCustomerSuggestion = z.infer<typeof creditCustomerSuggestionSchema>;
export type CreditCustomerList = z.infer<typeof creditCustomerListSchema>;
export type CreditCustomerUpdate = z.infer<typeof creditCustomerUpdateSchema>;
export type CreditPaymentCreate = z.infer<typeof creditPaymentCreateSchema>;
export type CreditPaymentVoid = z.infer<typeof creditPaymentVoidSchema>;
export type CreditFollowUp = z.infer<typeof creditFollowUpSchema>;
