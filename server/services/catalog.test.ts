// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PrismaClient } from "../generated/prisma/client.js";
import {
  bulkPriceChangeSchema,
  productCreateSchema,
  productListSchema,
  variantCreateSchema,
} from "../schemas/catalog.js";
import { createCatalogService } from "./catalog.js";

const ACTOR_ID = "4cd56ef4-56d8-4a22-92fe-887e6f601de6";
const CATEGORY_ID = "10000000-0000-4000-8000-000000000001";

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ProductRow {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string;
  featured: boolean;
  isActive: boolean;
  tags: string[];
  images: string[];
  youtubeLinks: string[];
  attributes: unknown;
  createdAt: Date;
  updatedAt: Date;
}

interface VariantRow {
  id: string;
  productId: string;
  name: string;
  sku: string;
  currentSellingPrice: string | number;
  availableStock: number;
  reservedStock: number;
  lowStockThreshold: number;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface HistoryRow {
  id: string;
  variantId: string;
  previousPrice: string | number | null;
  newPrice: string | number;
  reason: string;
  changedByProfileId: string;
  effectiveAt: Date;
  createdAt: Date;
}

function duplicate(target: string) {
  return { code: "P2002", meta: { target: [target] } };
}

function createInMemoryPrisma() {
  let sequence = 10;
  const id = () => `00000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`;
  const state: {
    categories: CategoryRow[];
    products: ProductRow[];
    variants: VariantRow[];
    histories: HistoryRow[];
  } = {
    categories: [{
      id: CATEGORY_ID,
      name: "Food",
      slug: "food",
      isActive: true,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    }],
    products: [],
    variants: [],
    histories: [],
  };

  const hydrate = (product: ProductRow) => ({
    ...product,
    category: state.categories.find((category) => category.id === product.categoryId)!,
    variants: state.variants
      .filter((variant) => variant.productId === product.id)
      .sort((left, right) => Number(right.isDefault) - Number(left.isDefault)),
  });

  const matchesProductWhere = (product: ProductRow, where: Record<string, unknown> | undefined) => {
    if (!where) return true;
    if (where.isActive === true && !product.isActive) return false;
    const categoryWhere = where.category as { isActive?: boolean; slug?: string } | undefined;
    const category = state.categories.find((item) => item.id === product.categoryId);
    if (categoryWhere?.isActive === true && !category?.isActive) return false;
    if (categoryWhere?.slug && category?.slug !== categoryWhere.slug) return false;
    return true;
  };

  const api = {
    category: {
      findMany: async ({ where }: { where?: { isActive?: boolean } } = {}) => state.categories
        .filter((category) => where?.isActive !== true || category.isActive),
      create: async ({ data }: { data: { name: string; slug: string } }) => {
        if (state.categories.some((category) => category.slug === data.slug)) throw duplicate("slug");
        const row = { ...data, id: id(), isActive: true, createdAt: new Date(), updatedAt: new Date() };
        state.categories.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<CategoryRow> }) => {
        if (data.slug && state.categories.some((category) => category.slug === data.slug && category.id !== where.id)) throw duplicate("slug");
        const row = state.categories.find((category) => category.id === where.id);
        if (!row) throw new Error("Category not found");
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
    },
    product: {
      findMany: async ({ where, skip = 0, take }: { where?: Record<string, unknown>; skip?: number; take?: number }) => {
        const rows = state.products.filter((product) => matchesProductWhere(product, where));
        return rows.slice(skip, take === undefined ? undefined : skip + take).map(hydrate);
      },
      count: async ({ where }: { where?: Record<string, unknown> }) => state.products.filter((product) => matchesProductWhere(product, where)).length,
      findUnique: async ({ where, select }: { where: { id: string }; select?: { id?: boolean } }) => {
        const row = state.products.find((product) => product.id === where.id);
        if (!row) return null;
        return select ? { id: row.id } : hydrate(row);
      },
      findFirst: async ({ where }: { where: { slug?: string; isActive?: boolean; category?: { isActive?: boolean } } }) => {
        const row = state.products.find((product) => {
          if (where.slug && product.slug !== where.slug) return false;
          return matchesProductWhere(product, where as Record<string, unknown>);
        });
        return row ? hydrate(row) : null;
      },
      create: async ({ data }: { data: Record<string, unknown> & { variants: { create: Record<string, unknown> } } }) => {
        if (state.products.some((product) => product.slug === data.slug)) throw duplicate("slug");
        const now = new Date();
        const product: ProductRow = {
          id: id(),
          categoryId: String(data.categoryId),
          name: String(data.name),
          slug: String(data.slug),
          description: String(data.description),
          featured: Boolean(data.featured),
          isActive: true,
          tags: data.tags as string[],
          images: data.images as string[],
          youtubeLinks: data.youtubeLinks as string[],
          attributes: data.attributes,
          createdAt: now,
          updatedAt: now,
        };
        const variantData = data.variants.create;
        const variant: VariantRow = {
          id: id(),
          productId: product.id,
          name: String(variantData.name),
          sku: String(variantData.sku),
          currentSellingPrice: String(variantData.currentSellingPrice),
          availableStock: 0,
          reservedStock: 0,
          lowStockThreshold: Number(variantData.lowStockThreshold),
          isDefault: Boolean(variantData.isDefault),
          isActive: true,
          createdAt: now,
          updatedAt: now,
        };
        if (state.variants.some((item) => item.sku === variant.sku)) throw duplicate("sku");
        state.products.push(product);
        state.variants.push(variant);
        return { ...product, variants: [variant] };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<ProductRow> }) => {
        if (data.slug && state.products.some((product) => product.slug === data.slug && product.id !== where.id)) throw duplicate("slug");
        const row = state.products.find((product) => product.id === where.id);
        if (!row) throw new Error("Product not found");
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
    },
    productVariant: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = state.variants.find((variant) => variant.id === where.id);
        return row ? { ...row } : null;
      },
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => state.variants
        .filter((variant) => where.id.in.includes(variant.id))
        .map((variant) => ({ ...variant })),
      findFirst: async ({ where }: { where: { productId: string; isActive?: boolean; id?: { not: string } } }) => state.variants.find((variant) => variant.productId === where.productId && (where.isActive !== true || variant.isActive) && variant.id !== where.id?.not) ?? null,
      count: async ({ where }: { where: { productId: string; isActive?: boolean } }) => state.variants.filter((variant) => variant.productId === where.productId && (where.isActive !== true || variant.isActive)).length,
      create: async ({ data }: { data: Partial<VariantRow> & Pick<VariantRow, "productId" | "name" | "sku"> }) => {
        if (state.variants.some((variant) => variant.sku === data.sku)) throw duplicate("sku");
        const row: VariantRow = {
          id: id(),
          productId: data.productId,
          name: data.name,
          sku: data.sku,
          currentSellingPrice: data.currentSellingPrice ?? 0,
          availableStock: 0,
          reservedStock: 0,
          lowStockThreshold: data.lowStockThreshold ?? 5,
          isDefault: data.isDefault ?? false,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        state.variants.push(row);
        return row;
      },
      updateMany: async ({ where, data }: { where: { productId: string; isDefault?: boolean; id?: { not: string } }; data: Partial<VariantRow> }) => {
        const rows = state.variants.filter((variant) => variant.productId === where.productId && (where.isDefault === undefined || variant.isDefault === where.isDefault) && variant.id !== where.id?.not);
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<VariantRow> }) => {
        const row = state.variants.find((variant) => variant.id === where.id);
        if (!row) throw new Error("Variant not found");
        if (data.sku && state.variants.some((variant) => variant.sku === data.sku && variant.id !== where.id)) throw duplicate("sku");
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
    },
    sellingPriceHistory: {
      create: async ({ data }: { data: Omit<HistoryRow, "id" | "effectiveAt" | "createdAt"> }) => {
        const row = { ...data, id: id(), effectiveAt: new Date(), createdAt: new Date() };
        state.histories.push(row);
        return row;
      },
      findMany: async ({ where }: { where: { variantId: string } }) => state.histories
        .filter((history) => history.variantId === where.variantId)
        .sort((left, right) => right.effectiveAt.getTime() - left.effectiveAt.getTime())
        .map((history) => ({ ...history, changedBy: { fullName: "Owner", role: "OWNER" } })),
    },
    $transaction: async (operation: unknown) => {
      if (Array.isArray(operation)) return Promise.all(operation);
      const snapshot = structuredClone(state);
      try {
        return await (operation as (transaction: typeof api) => Promise<unknown>)(api);
      } catch (error) {
        state.categories = snapshot.categories;
        state.products = snapshot.products;
        state.variants = snapshot.variants;
        state.histories = snapshot.histories;
        throw error;
      }
    },
  };

  return { prisma: api as unknown as PrismaClient, state };
}

function productInput(slug = "raw-honey", sku = "HONEY-500") {
  return productCreateSchema.parse({
    name: "Raw Honey",
    slug,
    categoryId: CATEGORY_ID,
    initialVariant: { name: "Default", sku, sellingPrice: "500.00" },
    priceReason: "Initial selling price",
  });
}

describe("PostgreSQL catalog service", () => {
  it("creates and edits categories", async () => {
    const { prisma } = createInMemoryPrisma();
    const service = createCatalogService(prisma);
    const created = await service.createCategory({ name: "Dairy", slug: "dairy" });
    const updated = await service.updateCategory(created.id, { name: "Fresh Dairy", slug: "fresh-dairy" });
    expect(updated).toMatchObject({ name: "Fresh Dairy", slug: "fresh-dairy" });
  });

  it("creates a product with one active default variant and initial history", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const service = createCatalogService(prisma);
    const product = await service.createProduct(productInput(), ACTOR_ID);
    expect(product.variants).toHaveLength(1);
    expect(product.variants[0]).toMatchObject({ name: "Default", sku: "HONEY-500", isDefault: true, isActive: true });
    expect(state.histories).toHaveLength(1);
    expect(state.histories[0].previousPrice).toBeNull();
  });

  it("supports multiple unique variants", async () => {
    const { prisma } = createInMemoryPrisma();
    const service = createCatalogService(prisma);
    const product = await service.createProduct(productInput(), ACTOR_ID);
    const updated = await service.createVariant(product.id, variantCreateSchema.parse({
      name: "1 kg", sku: "HONEY-1KG", sellingPrice: "900", priceReason: "Add larger pack",
    }), ACTOR_ID);
    expect(updated.variants.map((variant) => variant.sku)).toEqual(["HONEY-500", "HONEY-1KG"]);
  });

  it("rejects duplicate product slugs", async () => {
    const { prisma } = createInMemoryPrisma();
    const service = createCatalogService(prisma);
    await service.createProduct(productInput(), ACTOR_ID);
    await expect(service.createProduct(productInput("raw-honey", "OTHER-SKU"), ACTOR_ID))
      .rejects.toMatchObject({ code: "DUPLICATE_SLUG", status: 409 });
  });

  it("rejects duplicate SKUs across products and variants", async () => {
    const { prisma } = createInMemoryPrisma();
    const service = createCatalogService(prisma);
    const product = await service.createProduct(productInput(), ACTOR_ID);
    await expect(service.createVariant(product.id, variantCreateSchema.parse({
      name: "Duplicate", sku: "honey-500", sellingPrice: "700", priceReason: "Duplicate test",
    }), ACTOR_ID)).rejects.toMatchObject({ code: "DUPLICATE_SKU", status: 409 });
  });

  it("updates one selling price and appends immutable history", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const service = createCatalogService(prisma);
    const product = await service.createProduct(productInput(), ACTOR_ID);
    const variantId = product.variants[0].id;
    const updated = await service.changePrice(variantId, { sellingPrice: "550.00", reason: "Market adjustment" }, ACTOR_ID);
    expect(updated.variants[0].sellingPrice).toBe(550);
    expect(state.histories).toHaveLength(2);
    expect(state.histories[1]).toMatchObject({ previousPrice: "500.00", newPrice: "550.00" });
  });

  it("rolls back every bulk price change when a later update fails", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const service = createCatalogService(prisma);
    const product = await service.createProduct(productInput(), ACTOR_ID);
    const withSecond = await service.createVariant(product.id, variantCreateSchema.parse({
      name: "1 kg", sku: "HONEY-1KG", sellingPrice: "900", priceReason: "Add larger pack",
    }), ACTOR_ID);
    const [first, second] = withSecond.variants;
    const bulk = bulkPriceChangeSchema.parse({
      reason: "Seasonal price change",
      updates: [
        { variantId: first.id, sellingPrice: "525" },
        { variantId: second.id, sellingPrice: "900" },
      ],
    });
    await expect(service.bulkChangePrices(bulk, ACTOR_ID)).rejects.toMatchObject({ code: "PRICE_UNCHANGED" });
    expect(Number(state.variants.find((variant) => variant.id === first.id)!.currentSellingPrice)).toBe(500);
    expect(state.histories).toHaveLength(2);
  });

  it("hides inactive products from the public storefront but keeps them in admin", async () => {
    const { prisma } = createInMemoryPrisma();
    const service = createCatalogService(prisma);
    const product = await service.createProduct(productInput(), ACTOR_ID);
    await service.updateProduct(product.id, { isActive: false });
    const query = productListSchema.parse({ limit: 20, page: 1 });
    expect((await service.listProducts(query)).data).toHaveLength(0);
    expect((await service.listProducts(query, true)).data).toHaveLength(1);
    await expect(service.getProductBySlug(product.slug)).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
  });

  it("defines database-level immutable selling-price history", () => {
    const migration = readFileSync(
      "prisma/migrations/202607310001_auth_and_product_vertical/migration.sql",
      "utf8",
    );
    expect(migration).toContain("selling_price_history_immutable");
    expect(migration).toContain("BEFORE UPDATE OR DELETE");
  });
});
