import { z } from "zod";

const uuid = z.string().uuid();
const quantity = z.number().int().min(1).max(1_000_000);
const money = z.string().regex(/^\d+(?:\.\d{1,2})?$/).refine((value) => Number(value) >= 0);
const reason = z.string().trim().min(3).max(500);
const orderItems = z.array(z.object({
  productVariantId: uuid,
  quantity,
}).strict()).min(1).max(100);

function uniqueItems(items: Array<{ productVariantId: string }>, context: z.RefinementCtx) {
  const ids = items.map((item) => item.productVariantId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "Each variant may appear only once", path: ["items"] });
  }
}

const deliveryCustomer = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(7).max(30),
  email: z.string().trim().email().max(254).optional(),
  address: z.string().trim().min(5).max(1_000),
}).strict();

export const websiteCheckoutSchema = z.object({
  items: orderItems,
  customer: deliveryCustomer,
  deliveryRateId: uuid,
  idempotencyKey: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/),
}).strict().superRefine((value, context) => uniqueItems(value.items, context));

export const manualDeliveryOrderSchema = z.object({
  source: z.enum(["FACEBOOK", "PHONE", "WHATSAPP", "OTHER"]),
  initialStatus: z.enum(["PENDING", "CONFIRMED"]).default("CONFIRMED"),
  items: orderItems,
  customer: deliveryCustomer,
  deliveryRateId: uuid,
  discountTotal: money.default("0"),
  confirmUnprofitable: z.boolean().default(false),
}).strict().superRefine((value, context) => uniqueItems(value.items, context));

export const orderLifecycleSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("CONFIRM"), confirmUnprofitable: z.boolean().default(false) }).strict(),
  z.object({ action: z.literal("PROCESS") }).strict(),
  z.object({ action: z.literal("DELIVER") }).strict(),
  z.object({ action: z.literal("CANCEL"), reason }).strict(),
  z.object({ action: z.literal("FAILED_DELIVERY"), reason }).strict(),
  z.object({ action: z.literal("RETURN"), condition: z.enum(["SELLABLE", "DAMAGED"]), reason }).strict(),
]);

export const orderListSchema = z.object({
  source: z.enum(["WEBSITE", "PHYSICAL_SHOP", "FACEBOOK", "PHONE", "WHATSAPP", "OTHER"]).optional(),
  status: z.enum(["PENDING", "CONFIRMED", "PROCESSING", "DELIVERED", "COMPLETED", "CANCELLED", "RETURNED_SELLABLE", "RETURNED_DAMAGED"]).optional(),
  orderNumber: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
}).strict();

export const deliveryRateUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  charge: money.nullable().optional(),
  isActive: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0);

export type WebsiteCheckout = z.infer<typeof websiteCheckoutSchema>;
export type ManualDeliveryOrder = z.infer<typeof manualDeliveryOrderSchema>;
export type OrderLifecycle = z.infer<typeof orderLifecycleSchema>;
export type OrderList = z.infer<typeof orderListSchema>;
export type DeliveryRateUpdate = z.infer<typeof deliveryRateUpdateSchema>;
