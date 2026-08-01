import { z } from "zod";

const slug = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const money = z.string().regex(/^\d+(?:\.\d{1,2})?$/).refine((value) => Number(value) >= 0);
const uuid = z.string().uuid();
const sku = z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9._-]+$/).transform((value) => value.toUpperCase());

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug,
});

export const categoryUpdateSchema = categoryCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0);

export const productCreateSchema = z.object({
  name: z.string().trim().min(1).max(180),
  slug,
  description: z.string().trim().max(10_000).default(""),
  categoryId: uuid,
  featured: z.boolean().default(false),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  images: z.array(z.string().url()).max(12).default([]),
  youtubeLinks: z.array(z.string().url()).max(8).default([]),
  attributes: z.array(z.unknown()).max(20).default([]),
  initialVariant: z.object({
    name: z.string().trim().min(1).max(120),
    sku,
    sellingPrice: money,
    lowStockThreshold: z.number().int().min(0).max(1_000_000).default(5),
  }),
  priceReason: z.string().trim().min(3).max(300),
});

export const productUpdateSchema = z.object({
  name: z.string().trim().min(1).max(180).optional(),
  slug: slug.optional(),
  description: z.string().trim().max(10_000).optional(),
  categoryId: uuid.optional(),
  featured: z.boolean().optional(),
  isActive: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  images: z.array(z.string().url()).max(12).optional(),
  youtubeLinks: z.array(z.string().url()).max(8).optional(),
  attributes: z.array(z.unknown()).max(20).optional(),
}).refine((value) => Object.keys(value).some((key) => value[key as keyof typeof value] !== undefined));

export const variantCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sku,
  sellingPrice: money,
  lowStockThreshold: z.number().int().min(0).max(1_000_000).default(5),
  isDefault: z.boolean().default(false),
  priceReason: z.string().trim().min(3).max(300),
});

export const variantUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  sku: sku.optional(),
  lowStockThreshold: z.number().int().min(0).max(1_000_000).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
})
  .refine((value) => Object.keys(value).length > 0)
  .refine(
    (value) => !(value.isDefault === true && value.isActive === false),
    { message: "An inactive variant cannot be the default", path: ["isDefault"] },
  );

export const priceChangeSchema = z.object({
  sellingPrice: money,
  reason: z.string().trim().min(3).max(300),
});

export const bulkPriceChangeSchema = z.object({
  reason: z.string().trim().min(3).max(300),
  updates: z.array(z.object({
    variantId: uuid,
    sellingPrice: money,
  })).min(2).max(100),
}).superRefine((value, context) => {
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
});

export type CategoryCreate = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;
export type ProductCreate = z.infer<typeof productCreateSchema>;
export type ProductUpdate = z.infer<typeof productUpdateSchema>;
export type VariantCreate = z.infer<typeof variantCreateSchema>;
export type VariantUpdate = z.infer<typeof variantUpdateSchema>;
export type PriceChange = z.infer<typeof priceChangeSchema>;
export type BulkPriceChange = z.infer<typeof bulkPriceChangeSchema>;
export type ProductList = z.infer<typeof productListSchema>;
