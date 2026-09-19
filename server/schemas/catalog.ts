import { z } from "zod";

const slug = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const money = z.string().regex(/^\d+(?:\.\d{1,2})?$/).refine((value) => Number(value) >= 0);
const uuid = z.string().uuid();
const productKind = z.enum(["PACKAGED", "LOOSE_WEIGHT", "LOOSE_VOLUME", "EGG"]);
const optionalReason = (fallback: string) => z.string().trim().max(300).optional()
  .transform((value) => value || fallback);

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug,
}).strict();

export const categoryUpdateSchema = categoryCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
  isVisibleInShop: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0);

export const productCreateSchema = z.object({
  name: z.string().trim().min(1).max(180),
  slug,
  description: z.string().trim().max(10_000).default(""),
  categoryId: uuid,
  kind: productKind.default("PACKAGED"),
  featured: z.boolean().default(false),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  images: z.array(z.string().url()).max(12).default([]),
  youtubeLinks: z.array(z.string().url()).max(8).default([]),
  attributes: z.array(z.unknown()).max(20).default([]),
  initialVariant: z.object({
    name: z.string().trim().max(120).default(""),
    sellingPrice: money,
    bulkSellingPrice: money.optional(),
    lowStockThreshold: z.number().int().min(0).max(2_000_000_000).default(5),
  }).strict(),
  priceReason: optionalReason("প্রাথমিক দাম"),
}).strict().superRefine((value, context) => {
  if (value.kind !== "EGG") return;
  const regular = Number(value.initialVariant.sellingPrice);
  const bulk = Number(value.initialVariant.bulkSellingPrice);
  if (!value.initialVariant.bulkSellingPrice || regular <= 0 || bulk <= 0 || bulk >= regular) {
    context.addIssue({
      code: "custom",
      path: ["initialVariant", "bulkSellingPrice"],
      message: "15টি বা তার বেশি ডিমের দাম সাধারণ দামের চেয়ে কম হতে হবে।",
    });
  }
});

export const productUpdateSchema = z.object({
  name: z.string().trim().min(1).max(180).optional(),
  slug: slug.optional(),
  description: z.string().trim().max(10_000).optional(),
  categoryId: uuid.optional(),
  featured: z.boolean().optional(),
  isActive: z.boolean().optional(),
  isVisibleInShop: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  images: z.array(z.string().url()).max(12).optional(),
  youtubeLinks: z.array(z.string().url()).max(8).optional(),
  attributes: z.array(z.unknown()).max(20).optional(),
}).strict().refine((value) => Object.keys(value).some((key) => value[key as keyof typeof value] !== undefined));

export const productKindChangeSchema = z.object({
  kind: productKind,
  sellingPrice: money,
  bulkSellingPrice: money.optional(),
  lowStockThreshold: z.number().int().min(0).max(2_000_000_000),
  reason: optionalReason("পণ্যের ধরন পরিবর্তন"),
}).strict().superRefine((value, context) => {
  if (value.kind !== "EGG") return;
  const regular = Number(value.sellingPrice);
  const bulk = Number(value.bulkSellingPrice);
  if (!value.bulkSellingPrice || regular <= 0 || bulk <= 0 || bulk >= regular) {
    context.addIssue({ code: "custom", path: ["bulkSellingPrice"], message: "15টি বা তার বেশি ডিমের দাম সাধারণ দামের চেয়ে কম হতে হবে।" });
  }
});

export const variantCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sellingPrice: money,
  lowStockThreshold: z.number().int().min(0).max(2_000_000_000).default(5),
  isDefault: z.boolean().default(false),
  priceReason: optionalReason("প্রাথমিক দাম"),
}).strict();

export const variantUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  lowStockThreshold: z.number().int().min(0).max(2_000_000_000).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).strict()
  .refine((value) => Object.keys(value).length > 0)
  .refine(
    (value) => !(value.isDefault === true && value.isActive === false),
    { message: "ইনঅ্যাকটিভ প্যাক/সাইজকে মূল করা যাবে না।", path: ["isDefault"] },
  );

export const priceChangeSchema = z.object({
  sellingPrice: money,
  bulkSellingPrice: money.optional(),
  reason: optionalReason("দাম পরিবর্তন"),
}).strict();

export const bulkPriceChangeSchema = z.object({
  reason: optionalReason("একসাথে দাম পরিবর্তন"),
  updates: z.array(z.object({
    variantId: uuid,
    sellingPrice: money,
    bulkSellingPrice: money.optional(),
  }).strict()).min(2).max(100),
}).strict().superRefine((value, context) => {
  const ids = value.updates.map((update) => update.variantId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: "custom",
      path: ["updates"],
      message: "Each variant may appear only once in a bulk update",
    });
  }
});

export const productListSchema = z.object({
  query: z.string().trim().max(180).optional(),
  category: z.string().trim().max(120).optional(),
  tag: z.string().trim().max(60).optional(),
  featured: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort: z.enum(["newest", "oldest", "price_asc", "price_desc", "name_asc", "name_desc"]).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
}).strict();

export type CategoryCreate = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;
export type ProductCreate = z.infer<typeof productCreateSchema>;
export type ProductUpdate = z.infer<typeof productUpdateSchema>;
export type ProductKindChange = z.infer<typeof productKindChangeSchema>;
export type VariantCreate = z.infer<typeof variantCreateSchema>;
export type VariantUpdate = z.infer<typeof variantUpdateSchema>;
export type PriceChange = z.infer<typeof priceChangeSchema>;
export type BulkPriceChange = z.infer<typeof bulkPriceChangeSchema>;
export type ProductList = z.infer<typeof productListSchema>;
