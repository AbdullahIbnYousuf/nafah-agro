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
  isVisibleInShop: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ProductRow {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string;
  kind: "PACKAGED" | "LOOSE_WEIGHT" | "LOOSE_VOLUME";
  featured: boolean;
  isActive: boolean;
  isVisibleInShop: boolean;
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
  return {
    code: "P2002",
    message: `Unique constraint failed on the fields: (${target})`,
    meta: {
      modelName: "TestModel",
      driverAdapterError: {
        cause: { kind: "UniqueConstraintViolation", constraint: { fields: [target] } },
      },
    },
  };
}

function createInMemoryPrisma() {
  let sequence = 10;
  const id = () => `00000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`;
  const state: {
    categories: CategoryRow[];
    products: ProductRow[];
    variants: VariantRow[];
    histories: HistoryRow[];
    usedVariantIds: string[];
    audits: Array<Record<string, unknown>>;
    categoryDeleteConflict: boolean;
    productDeleteConflict: boolean;
  } = {
    categories: [{
      id: CATEGORY_ID,
      name: "Food",
      slug: "food",
      isActive: true,
      isVisibleInShop: true,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    }],
    products: [],
    variants: [],
    histories: [],
    usedVariantIds: [],
    audits: [],
    categoryDeleteConflict: false,
    productDeleteConflict: false,
  };

  const hydrate = (product: ProductRow) => ({
    ...product,
    category: state.categories.find((category) => category.id === product.categoryId)!,
    variants: state.variants
      .filter((variant) => variant.productId === product.id)
      .sort((left, right) => Number(right.isDefault) - Number(left.isDefault)),
  });

  const hydrateWithCounts = (product: ProductRow) => ({
    ...hydrate(product),
    variants: state.variants
      .filter((variant) => variant.productId === product.id)
      .sort((left, right) => Number(right.isDefault) - Number(left.isDefault))
      .map((variant) => ({
        ...variant,
        _count: {
          stockBatches: state.usedVariantIds.includes(variant.id) ? 1 : 0,
          stockAdjustments: 0,
          salesOrderItems: 0,
          priceHistory: state.histories.filter((history) => history.variantId === variant.id).length,
        },
      })),
  });

  const matchesProductWhere = (product: ProductRow, where: Record<string, unknown> | undefined) => {
    if (!where) return true;
    if (where.isActive === true && !product.isActive) return false;
    if (where.isVisibleInShop === true && !product.isVisibleInShop) return false;
    if (typeof where.kind === "string" && product.kind !== where.kind) return false;
    const categoryWhere = where.category as { isActive?: boolean; isVisibleInShop?: boolean; slug?: string } | undefined;
    const category = state.categories.find((item) => item.id === product.categoryId);
    if (categoryWhere?.isActive === true && !category?.isActive) return false;
    if (categoryWhere?.isVisibleInShop === true && !category?.isVisibleInShop) return false;
    if (categoryWhere?.slug && category?.slug !== categoryWhere.slug) return false;
    return true;
  };

  const api = {
    category: {
      findMany: async ({ where }: { where?: { isActive?: boolean; isVisibleInShop?: boolean } } = {}) => state.categories
        .filter((category) => (where?.isActive !== true || category.isActive)
          && (where?.isVisibleInShop !== true || category.isVisibleInShop))
        .map((category) => ({
          ...category,
          _count: { products: state.products.filter((product) => product.categoryId === category.id).length },
        })),
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = state.categories.find((category) => category.id === where.id);
        return row ? {
          ...row,
          _count: { products: state.products.filter((product) => product.categoryId === row.id).length },
        } : null;
      },
      create: async ({ data }: { data: { name: string; slug: string } }) => {
        if (state.categories.some((category) => category.slug === data.slug)) throw duplicate("slug");
        const row = { ...data, id: id(), isActive: true, isVisibleInShop: true, createdAt: new Date(), updatedAt: new Date() };
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
      delete: async ({ where }: { where: { id: string } }) => {
        if (state.categoryDeleteConflict) throw { code: "P2003" };
        const index = state.categories.findIndex((category) => category.id === where.id);
        if (index < 0) throw new Error("Category not found");
        return state.categories.splice(index, 1)[0];
      },
    },
    product: {
      findMany: async ({ where, skip = 0, take }: { where?: Record<string, unknown>; skip?: number; take?: number }) => {
        const rows = state.products.filter((product) => matchesProductWhere(product, where));
        return rows.slice(skip, take === undefined ? undefined : skip + take).map(hydrateWithCounts);
      },
      count: async ({ where }: { where?: Record<string, unknown> }) => state.products.filter((product) => matchesProductWhere(product, where)).length,
      findUnique: async ({ where, select }: { where: { id: string }; select?: { id?: boolean; variants?: unknown } }) => {
        const row = state.products.find((product) => product.id === where.id);
        if (!row) return null;
        if (select?.variants) {
          const hydrated = hydrateWithCounts(row);
          return {
            id: row.id,
            kind: row.kind,
            name: row.name,
            slug: row.slug,
            isActive: row.isActive,
            images: row.images,
            variants: hydrated.variants.map((variant) => ({
              ...variant,
              priceHistory: state.histories
                .filter((history) => history.variantId === variant.id)
                .slice(0, 2)
                .map((history) => ({ previousPrice: history.previousPrice })),
            })),
          };
        }
        return select ? { id: row.id } : hydrateWithCounts(row);
      },
      findFirst: async ({ where }: { where: { slug?: string; isActive?: boolean; isVisibleInShop?: boolean; category?: { isActive?: boolean; isVisibleInShop?: boolean } } }) => {
        const row = state.products.find((product) => {
          if (where.slug && product.slug !== where.slug) return false;
          return matchesProductWhere(product, where as Record<string, unknown>);
        });
        return row ? hydrateWithCounts(row) : null;
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
          kind: (data.kind as ProductRow["kind"] | undefined) ?? "PACKAGED",
          featured: Boolean(data.featured),
          isActive: true,
          isVisibleInShop: true,
          tags: data.tags as string[],
          images: data.images as string[],
          youtubeLinks: data.youtubeLinks as string[],
          attributes: data.attributes,
          createdAt: now,
          updatedAt: now,
        };
        const variantData = data.variants.create;
        const variant: VariantRow = {
          id: String(variantData.id ?? id()),
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
      delete: async ({ where }: { where: { id: string } }) => {
        if (state.productDeleteConflict) throw { code: "P2003" };
        const index = state.products.findIndex((product) => product.id === where.id);
        if (index < 0) throw new Error("Product not found");
        const [row] = state.products.splice(index, 1);
        state.variants = state.variants.filter((variant) => variant.productId !== where.id);
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
          id: data.id ?? id(),
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
      deleteMany: async ({ where }: { where: { variantId: { in: string[] } } }) => {
        const before = state.histories.length;
        state.histories = state.histories.filter((history) => !where.variantId.in.includes(history.variantId));
        return { count: before - state.histories.length };
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.audits.push(data);
        return data;
      },
    },
    $executeRaw: async () => 1,
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
        state.usedVariantIds = snapshot.usedVariantIds;
        state.audits = snapshot.audits;
        state.categoryDeleteConflict = snapshot.categoryDeleteConflict;
        state.productDeleteConflict = snapshot.productDeleteConflict;
        throw error;
      }
    },
  };

  return { prisma: api as unknown as PrismaClient, state };
}

function productInput(slug = "raw-honey", packSize = "", kind: ProductRow["kind"] = "PACKAGED") {
  return productCreateSchema.parse({
    name: "Raw Honey",
    slug,
    categoryId: CATEGORY_ID,
    kind,
    initialVariant: { name: packSize, sellingPrice: "500.00" },
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
    expect(product.variants[0]).toMatchObject({ name: "Default", isDefault: true, isActive: true });
    expect(product.variants[0].sku).toMatch(/^NAF-[0-9A-F-]{36}$/);
    expect(state.histories).toHaveLength(1);
    expect(state.histories[0].previousPrice).toBeNull();
  });

  it("supports multiple unique variants", async () => {
    const { prisma } = createInMemoryPrisma();
    const service = createCatalogService(prisma);
    const product = await service.createProduct(productInput("raw-honey", "500 g"), ACTOR_ID);
    const updated = await service.createVariant(product.id, variantCreateSchema.parse({
      name: "1 kg", sellingPrice: "900", priceReason: "Add larger pack",
    }), ACTOR_ID);
    expect(updated.variants.map((variant) => variant.name)).toEqual(["500 g", "1 kg"]);
    expect(new Set(updated.variants.map((variant) => variant.sku)).size).toBe(2);
  });

  it("creates a loose product with one hidden option and rejects extra pack sizes", async () => {
    const { prisma } = createInMemoryPrisma();
    const service = createCatalogService(prisma);
    const product = await service.createProduct(productInput("loose-rice", "ignored", "LOOSE_WEIGHT"), ACTOR_ID);
    expect(product).toMatchObject({ kind: "LOOSE_WEIGHT", variantName: "Default" });
    await expect(service.createVariant(product.id, variantCreateSchema.parse({
      name: "5 kg", sellingPrice: "700", priceReason: "Not allowed",
    }), ACTOR_ID)).rejects.toMatchObject({ code: "LOOSE_PRODUCT_SINGLE_OPTION", status: 409 });
  });

  it("changes product type only before operational history exists", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const service = createCatalogService(prisma);
    const product = await service.createProduct(productInput(), ACTOR_ID);
    const changed = await service.changeProductKind(product.id, {
      kind: "LOOSE_WEIGHT", sellingPrice: "120.00", lowStockThreshold: 5_000, reason: "Correct product setup",
    }, ACTOR_ID);
    expect(changed).toMatchObject({ kind: "LOOSE_WEIGHT", price: 120 });
    state.usedVariantIds.push(changed.variants[0].id);
    await expect(service.changeProductKind(product.id, {
      kind: "LOOSE_VOLUME", sellingPrice: "130.00", lowStockThreshold: 2_000, reason: "Invalid later change",
    }, ACTOR_ID)).rejects.toMatchObject({ code: "PRODUCT_KIND_LOCKED", status: 409 });
  });

  it("creates unique product slugs when products share the same generated URL", async () => {
    const { prisma } = createInMemoryPrisma();
    const service = createCatalogService(prisma);
    const first = await service.createProduct(productInput(), ACTOR_ID);
    const second = await service.createProduct(productInput("raw-honey", "500 g"), ACTOR_ID);
    const third = await service.createProduct(productInput("raw-honey", "1 kg"), ACTOR_ID);

    expect([first.slug, second.slug, third.slug]).toEqual(["raw-honey", "raw-honey-2", "raw-honey-3"]);
    expect(new Set([first.id, second.id, third.id])).toHaveLength(3);
  });

  it("requires an unnamed default pack/size to be named before adding another", async () => {
    const { prisma } = createInMemoryPrisma();
    const service = createCatalogService(prisma);
    const product = await service.createProduct(productInput(), ACTOR_ID);
    await expect(service.createVariant(product.id, variantCreateSchema.parse({
      name: "1 kg", sellingPrice: "700", priceReason: "Add named pack",
    }), ACTOR_ID)).rejects.toMatchObject({ code: "UNNAMED_DEFAULT_PACK_SIZE", status: 409 });
    await service.updateVariant(product.variants[0].id, { name: "500 g" });
    const updated = await service.createVariant(product.id, variantCreateSchema.parse({
      name: "1 kg", sellingPrice: "700", priceReason: "Add named pack",
    }), ACTOR_ID);
    expect(updated.variants.map((variant) => variant.name)).toEqual(["500 g", "1 kg"]);
    await expect(service.updateVariant(updated.variants[0].id, { name: "Default" }))
      .rejects.toMatchObject({ code: "PACK_SIZE_NAME_REQUIRED", status: 409 });
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
    const product = await service.createProduct(productInput("raw-honey", "500 g"), ACTOR_ID);
    const withSecond = await service.createVariant(product.id, variantCreateSchema.parse({
      name: "1 kg", sellingPrice: "900", priceReason: "Add larger pack",
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

  it("keeps active and storefront visibility settings independent across category gates", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const service = createCatalogService(prisma);
    const product = await service.createProduct(productInput(), ACTOR_ID);
    const query = productListSchema.parse({ limit: 20, page: 1 });

    await service.updateProduct(product.id, { isVisibleInShop: false });
    expect((await service.listProducts(query)).data).toHaveLength(0);
    expect((await service.listProducts(query, true)).data[0]).toMatchObject({
      isActive: true,
      isVisibleInShop: false,
    });

    await service.updateCategory(CATEGORY_ID, { isActive: false, isVisibleInShop: false });
    expect(state.products[0]).toMatchObject({ isActive: true, isVisibleInShop: false });
    await service.updateCategory(CATEGORY_ID, { isActive: true, isVisibleInShop: true });
    expect((await service.listProducts(query)).data).toHaveLength(0);

    await service.updateProduct(product.id, { isVisibleInShop: true });
    expect((await service.listProducts(query)).data).toHaveLength(1);
  });

  it("excludes hidden categories from storefront filters without deactivating products", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const service = createCatalogService(prisma);
    await service.createProduct({ ...productInput(), tags: ["premium"] }, ACTOR_ID);

    await service.updateCategory(CATEGORY_ID, { isVisibleInShop: false });
    const filters = await service.listStorefrontFilters();
    expect(filters.categories).toHaveLength(0);
    expect(filters.tags).toHaveLength(0);
    expect(state.products[0]).toMatchObject({ isActive: true, isVisibleInShop: true });
  });

  it("returns compact active storefront filters", async () => {
    const { prisma } = createInMemoryPrisma();
    const service = createCatalogService(prisma);
    await service.createProduct({ ...productInput(), tags: ["premium", "rice"] }, ACTOR_ID);

    const filters = await service.listStorefrontFilters();
    expect(filters.tags).toEqual(["premium", "rice"]);
    expect(filters.categories.some((category) => category.id === CATEGORY_ID)).toBe(true);
  });

  it("starts the independent storefront listing and count queries together", async () => {
    const { prisma } = createInMemoryPrisma();
    const service = createCatalogService(prisma);
    await service.createProduct(productInput(), ACTOR_ID);
    const records = await prisma.product.findMany({});
    const countValue = await prisma.product.count({});
    let resolveRecords!: (value: typeof records) => void;
    let resolveCount!: (value: number) => void;
    const findMany = vi.spyOn(prisma.product, "findMany").mockReturnValue(new Promise((resolve) => { resolveRecords = resolve; }));
    const count = vi.spyOn(prisma.product, "count").mockReturnValue(new Promise((resolve) => { resolveCount = resolve; }));

    const pending = service.listProducts(productListSchema.parse({ limit: 20, page: 1 }));
    await Promise.resolve();
    expect(findMany).toHaveBeenCalledOnce();
    expect(count).toHaveBeenCalledOnce();
    resolveRecords(records);
    resolveCount(countValue);
    await expect(pending).resolves.toMatchObject({ total: 1 });
  });

  it("deletes an empty category but rejects a category containing products", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const service = createCatalogService(prisma);
    const empty = await service.createCategory({ name: "Empty", slug: "empty" });

    await expect(service.deleteCategory(empty.id, ACTOR_ID)).resolves.toEqual({ id: empty.id });
    expect(state.categories.some((category) => category.id === empty.id)).toBe(false);
    expect(state.audits.at(-1)).toMatchObject({ action: "UNUSED_CATEGORY_DELETED", entityId: empty.id });

    await service.createProduct(productInput(), ACTOR_ID);
    await expect(service.deleteCategory(CATEGORY_ID, ACTOR_ID))
      .rejects.toMatchObject({ code: "CATEGORY_HAS_PRODUCTS", status: 409 });
  });

  it("deletes an operationally unused product with its setup price history", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const service = createCatalogService(prisma);
    const product = await service.createProduct(productInput(), ACTOR_ID);
    const query = productListSchema.parse({ limit: 20, page: 1 });

    expect((await service.listProducts(query, true)).data[0].canDelete).toBe(true);
    await expect(service.deleteProduct(product.id, ACTOR_ID)).resolves.toEqual({ id: product.id });
    expect(state.products).toHaveLength(0);
    expect(state.variants).toHaveLength(0);
    expect(state.histories).toHaveLength(0);
    expect(state.audits.at(-1)).toMatchObject({ action: "UNUSED_PRODUCT_DELETED", entityId: product.id });
  });

  it("keeps products with inventory or order history as deactivation-only", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const service = createCatalogService(prisma);
    const product = await service.createProduct(productInput(), ACTOR_ID);
    state.usedVariantIds.push(product.variants[0].id);
    const query = productListSchema.parse({ limit: 20, page: 1 });

    expect((await service.listProducts(query, true)).data[0].canDelete).toBe(false);
    await expect(service.deleteProduct(product.id, ACTOR_ID))
      .rejects.toMatchObject({ code: "PRODUCT_HAS_HISTORY", status: 409 });
    expect(state.products).toHaveLength(1);
    expect(state.histories).toHaveLength(1);
  });

  it("keeps products with cached stock or actual price updates as deactivation-only", async () => {
    const cachedStock = createInMemoryPrisma();
    const cachedStockService = createCatalogService(cachedStock.prisma);
    const stockedProduct = await cachedStockService.createProduct(productInput(), ACTOR_ID);
    cachedStock.state.variants[0].availableStock = 1;
    const query = productListSchema.parse({ limit: 20, page: 1 });

    expect((await cachedStockService.listProducts(query, true)).data[0].canDelete).toBe(false);
    await expect(cachedStockService.deleteProduct(stockedProduct.id, ACTOR_ID))
      .rejects.toMatchObject({ code: "PRODUCT_HAS_HISTORY", status: 409 });

    const repriced = createInMemoryPrisma();
    const repricedService = createCatalogService(repriced.prisma);
    const repricedProduct = await repricedService.createProduct(productInput(), ACTOR_ID);
    await repricedService.changePrice(
      repricedProduct.variants[0].id,
      { sellingPrice: "550.00", reason: "Market adjustment" },
      ACTOR_ID,
    );

    expect((await repricedService.listProducts(query, true)).data[0].canDelete).toBe(false);
    await expect(repricedService.deleteProduct(repricedProduct.id, ACTOR_ID))
      .rejects.toMatchObject({ code: "PRODUCT_HAS_PRICE_UPDATES", status: 409 });
    expect(repriced.state.histories).toHaveLength(2);
  });

  it("turns concurrent delete constraints into safe conflicts and rolls back", async () => {
    const { prisma, state } = createInMemoryPrisma();
    const service = createCatalogService(prisma);
    const empty = await service.createCategory({ name: "Empty", slug: "empty" });
    state.categoryDeleteConflict = true;
    await expect(service.deleteCategory(empty.id, ACTOR_ID))
      .rejects.toMatchObject({ code: "CATEGORY_DELETE_CONFLICT", status: 409 });
    expect(state.categories.some((category) => category.id === empty.id)).toBe(true);

    state.categoryDeleteConflict = false;
    const product = await service.createProduct(productInput(), ACTOR_ID);
    state.productDeleteConflict = true;
    await expect(service.deleteProduct(product.id, ACTOR_ID))
      .rejects.toMatchObject({ code: "PRODUCT_DELETE_CONFLICT", status: 409 });
    expect(state.products.some((item) => item.id === product.id)).toBe(true);
    expect(state.histories).toHaveLength(1);
  });

  it("defines database-level immutable selling-price history", () => {
    const migration = readFileSync(
      "prisma/migrations/202607310001_auth_and_product_vertical/migration.sql",
      "utf8",
    );
    expect(migration).toContain("selling_price_history_immutable");
    expect(migration).toContain("BEFORE UPDATE OR DELETE");

    const deletionMigration = readFileSync(
      "prisma/migrations/202608080002_unused_catalog_deletion/migration.sql",
      "utf8",
    );
    expect(deletionMigration).toContain("nafah.allow_unused_catalog_delete");
    expect(deletionMigration).toContain("current_setting");
  });

  it("defaults existing category and product visibility to Show in the migration", () => {
    const migration = readFileSync(
      "prisma/migrations/202609110001_catalog_visibility/migration.sql",
      "utf8",
    );
    expect(migration).toContain('ALTER TABLE "categories"\nADD COLUMN "is_visible_in_shop" BOOLEAN NOT NULL DEFAULT true');
    expect(migration).toContain('ALTER TABLE "products"\nADD COLUMN "is_visible_in_shop" BOOLEAN NOT NULL DEFAULT true');
    expect(migration.match(/BOOLEAN NOT NULL DEFAULT true/g)).toHaveLength(2);
  });
});
