import { z } from "zod";

export const expensePaymentChannelSchema = z.enum(["CASH", "BKASH", "NAGAD", "ROCKET", "BANK"]);
const uuid = z.string().uuid();
const name = z.string().trim().min(1).max(120).transform((value) => value.replace(/\s+/g, " "));
const amount = z.string().regex(/^\d+(?:\.\d{1,2})?$/).refine((value) => Number(value) > 0 && Number(value) <= 999_999_999_999.99, "খরচের টাকা ০-এর বেশি দিন।");
const reason = z.string().trim().min(3).max(500);
const paidOn = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "সঠিক তারিখ দিন।").refine((value) => value <= new Date(Date.now() + 6 * 60 * 60 * 1_000).toISOString().slice(0, 10), "ভবিষ্যতের তারিখ দেওয়া যাবে না।");

export const expenseCreateSchema = z.object({
  name, amount, paidOn,
  paymentChannel: expensePaymentChannelSchema.default("CASH"),
  note: z.string().trim().max(1_000).optional(),
  idempotencyKey: uuid,
}).strict();

export const expenseUpdateSchema = z.object({
  name, amount, paidOn,
  paymentChannel: expensePaymentChannelSchema,
  note: z.string().trim().max(1_000).optional(),
  reason,
}).strict();

export const expenseVoidSchema = z.object({ reason }).strict();
const dateFilter = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "সঠিক তারিখ দিন।");
export const expenseListSchema = z.object({
  from: dateFilter.optional(), to: dateFilter.optional(),
  q: z.string().trim().max(120).optional(),
  paymentChannel: expensePaymentChannelSchema.optional(),
  status: z.enum(["ACTIVE", "VOIDED", "ALL"]).default("ACTIVE"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to, "শুরুর তারিখ শেষের তারিখের পরে হতে পারে না।");

export const expenseSummarySchema = z.object({ from: dateFilter.optional(), to: dateFilter.optional() }).strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, "শুরুর তারিখ শেষের তারিখের পরে হতে পারে না।");
export const expenseSuggestionsSchema = z.object({ q: z.string().trim().max(120).default("") }).strict();
