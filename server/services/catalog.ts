import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import type {
  BulkPriceChange,
  CategoryCreate,
  CategoryUpdate,
  PriceChange,
  ProductCreate,
  ProductKindChange,
  ProductList,
  ProductUpdate,
  VariantCreate,
  VariantUpdate,
} from "../schemas/catalog.js";

const publicProductInclude = {
  category: { select: { id: true, name: true, slug: true, isActive: true, isVisibleInShop: true } },
  variants: {
    where: { isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  },
} satisfies Prisma.ProductInclude;

const adminProductInclude = {
  category: { select: { id: true, name: true, slug: true, isActive: true, isVisibleInShop: true } },
  variants: {
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    include: {
      _count: {
        select: {
          stockBatches: true,
          stockAdjustments: true,
          salesOrderItems: true,
          priceHistory: true,
        },
      },
    },
  },
} satisfies Prisma.ProductInclude;

type PublicProductRecord = Prisma.ProductGetPayload<{ include: typeof publicProductInclude }>;
type AdminProductRecord = Prisma.ProductGetPayload<{ include: typeof adminProductInclude }>;
type ProductRecord = PublicProductRecord | AdminProductRecord;

function catalogError(status: number, code: string, message: string) {
  return Object.assign(new Error(message), { status, code });
}

function internalSku(variantId: string) {
  return `NAF-${variantId.toUpperCase()}`;
}

function isUnnamedPackSize(name: string) {
  return name.trim().toLowerCase() === "default";
}

function constraintTarget(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const candidate = error as { code?: unknown; message?: unknown; meta?: unknown };
  if (candidate.code !== "P2002") return "";
  let metadata = "";
  try {
    metadata = JSON.stringify(candidate.meta ?? "");
  } catch {
    // Some database adapters attach non-serializable metadata. The Prisma
    // message still contains the affected field and remains safe to inspect.
  }
  return `${metadata} ${String(candidate.message ?? "")}`.toLowerCase();
}

function productSlugCandidate(base: string, attempt: number) {
  if (attempt === 0) return base;
  const suffix = `-${attempt + 1}`;
  const prefix = base.slice(0, 120 - suffix.length).replace(/-+$/, "");
  return `${prefix}${suffix}`;
}

function rethrowCatalogWriteError(error: unknown): never {
  const target = constraintTarget(error);
  if (target.includes("sku")) throw catalogError(409, "DUPLICATE_SKU", "That SKU is already in use.");
  if (target.includes("slug")) throw catalogError(409, "DUPLICATE_SLUG", "That slug is already in use.");
  throw error;
}

function isDeleteConstraintConflict(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "P2003" || code === "P2014";
}

function hasNoBusinessHistory(variant: ProductRecord["variants"][number]) {
  if (!("_count" in variant)) return false;
  return variant.availableStock === 0
    && variant.reservedStock === 0
    && variant._count.stockBatches === 0
    && variant._count.stockAdjustments === 0
    && variant._count.salesOrderItems === 0
    && variant._count.priceHistory <= 1;
}

function productDto(product: ProductRecord, includeInactiveVariants: boolean) {
  const visibleVariants = includeInactiveVariants
    ? product.variants
    : product.variants.filter((variant) => variant.isActive);
  const defaultVariant = visibleVariants.find((variant) => variant.isDefault) ?? visibleVariants[0];
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    kind: product.kind ?? "PACKAGED",
    categoryId: product.categoryId,
    category: product.category,
    featured: product.featured,
    isActive: product.isActive,
    isVisibleInShop: product.isVisibleInShop,
    tags: product.tags,
    images: product.images,
    youtubeLinks: product.youtubeLinks,
    attributes: product.attributes,
    price: defaultVariant ? Number(defaultVariant.currentSellingPrice) : 0,
    stock: visibleVariants.reduce((total, variant) => total + variant.availableStock, 0),
    sku: defaultVariant?.sku,
    variantName: defaultVariant?.name,
    defaultVariantId: defaultVariant?.id,
    canDelete: includeInactiveVariants && product.variants.every(hasNoBusinessHistory),
    variants: visibleVariants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      sellingPrice: Number(variant.currentSellingPrice),
      availableStock: variant.availableStock,
      reservedStock: variant.reservedStock,
      lowStockThreshold: variant.lowStockThreshold,
      isDefault: variant.isDefault,
      isActive: variant.isActive,
    })),
  };
}

export function createCatalogService(prisma: PrismaClient) {
  async function readProduct(id: string, includeInactiveVariants = true) {
    const product = await prisma.product.findUnique({ where: { id }, include: adminProductInclude });
    if (!product) throw catalogError(404, "PRODUCT_NOT_FOUND", "Product not found");
    return productDto(product, includeInactiveVariants);
  }

  return {
    async listCategories(includeInactive = false) {
      const categories = await prisma.category.findMany({
        where: includeInactive ? undefined : { isActive: true, isVisibleInShop: true },
        orderBy: { name: "asc" },
        include: { _count: { select: { products: true } } },
      });
      return categories.map(({ _count, ...category }) => ({
        ...category,
        canDelete: includeInactive && _count.products === 0,
      }));
    },
    async listStorefrontFilters() {
      const [categories, products] = await Promise.all([
        prisma.category.findMany({
          where: { isActive: true, isVisibleInShop: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, slug: true, isActive: true, isVisibleInShop: true },
        }),
        prisma.product.findMany({
          where: {
            kind: "PACKAGED",
            isActive: true,
            isVisibleInShop: true,
            category: { isActive: true, isVisibleInShop: true },
          },
          select: { tags: true },
        }),
      ]);
      return {
        categories,
        tags: [...new Set(products.flatMap((product) => product.tags))].sort(),
      };
    },
    async createCategory(input: CategoryCreate) {
      try {
        return await prisma.category.create({ data: input });
      } catch (error) {
        rethrowCatalogWriteError(error);
      }
    },
    async updateCategory(id: string, input: CategoryUpdate) {
      try {
        return await prisma.category.update({ where: { id }, data: input });
      } catch (error) {
        rethrowCatalogWriteError(error);
      }
    },
    async deleteCategory(id: string, actorId: string) {
      try {
        return await prisma.$transaction(async (transaction) => {
          const category = await transaction.category.findUnique({
            where: { id },
            select: { id: true, name: true, slug: true, isActive: true, _count: { select: { products: true } } },
          });
          if (!category) throw catalogError(404, "CATEGORY_NOT_FOUND", "Category not found");
          if (category._count.products > 0) {
            throw catalogError(409, "CATEGORY_HAS_PRODUCTS", "এই ক্যাটাগরিতে পণ্য আছে। তাই এটি মুছতে পারবেন না, শুধু ইনঅ্যাকটিভ করতে পারবেন।");
          }
          await transaction.category.delete({ where: { id } });
          await transaction.auditLog.create({ data: {
            actorProfileId: actorId,
            action: "UNUSED_CATEGORY_DELETED",
            entityType: "CATEGORY",
            entityId: id,
            previousData: { name: category.name, slug: category.slug, isActive: category.isActive },
            reason: "Unused category removal",
          } });
          return { id };
        });
      } catch (error) {
        if (isDeleteConstraintConflict(error)) {
          throw catalogError(409, "CATEGORY_DELETE_CONFLICT", "এই ক্যাটাগরিটি এখন ব্যবহৃত হচ্ছে। তাই এটি মুছতে পারবেন না, শুধু ইনঅ্যাকটিভ করতে পারবেন।");
        }
        throw error;
      }
    },
    async listProducts(input: ProductList, includeInactive = false) {
      const where: Prisma.ProductWhereInput = {
        ...(includeInactive ? {} : { kind: "PACKAGED", isActive: true, isVisibleInShop: true, category: {
          isActive: true,
          isVisibleInShop: true,
          ...(input.category ? { slug: input.category } : {}),
        } }),
        ...(includeInactive && input.category ? { category: { slug: input.category } } : {}),
        ...(input.query ? { name: { contains: input.query, mode: "insensitive" } } : {}),
        ...(input.tag ? { tags: { has: input.tag } } : {}),
        ...(input.featured !== undefined ? { featured: input.featured } : {}),
        ...((input.minPrice !== undefined || input.maxPrice !== undefined) ? {
          variants: { some: {
            ...(includeInactive ? {} : { isActive: true }),
            currentSellingPrice: { gte: input.minPrice, lte: input.maxPrice },
          } },
        } : {}),
      };
      const orderBy: Prisma.ProductOrderByWithRelationInput = input.sort === "oldest"
        ? { createdAt: "asc" }
        : input.sort === "name_asc"
          ? { name: "asc" }
          : input.sort === "name_desc"
            ? { name: "desc" }
            : { createdAt: "desc" };
      const priceSort = input.sort === "price_asc" || input.sort === "price_desc";
      // These are independent reads. Avoid opening an interactive transaction
      // for storefront pagination because pooled/serverless connections can be
      // briefly exhausted by concurrent page loads.
      const include = includeInactive ? adminProductInclude : publicProductInclude;
      const [records, total] = await Promise.all([
        prisma.product.findMany({
          where,
          include,
          orderBy,
          ...(priceSort ? {} : { skip: (input.page - 1) * input.limit, take: input.limit }),
        }),
        prisma.product.count({ where }),
      ]);
      let data = records.map((product) => productDto(product, includeInactive));
      if (priceSort) {
        data = data.sort((a, b) => input.sort === "price_asc" ? a.price - b.price : b.price - a.price);
        data = data.slice((input.page - 1) * input.limit, input.page * input.limit);
      }
      return { data, total, page: input.page, limit: input.limit, totalPages: Math.ceil(total / input.limit) };
    },
    async getProductBySlug(slug: string) {
      const product = await prisma.product.findFirst({
        where: {
          slug,
          kind: "PACKAGED",
          isActive: true,
          isVisibleInShop: true,
          category: { isActive: true, isVisibleInShop: true },
        },
        include: publicProductInclude,
      });
      if (!product) throw catalogError(404, "PRODUCT_NOT_FOUND", "Product not found");
      return productDto(product, false);
    },
    async getProductById(id: string) {
      return readProduct(id, true);
    },
    async createProduct(input: ProductCreate, actorId: string) {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const candidateSlug = productSlugCandidate(input.slug, attempt);
        try {
          const productId = await prisma.$transaction(async (transaction) => {
            const variantId = randomUUID();
            const product = await transaction.product.create({
              data: {
                name: input.name,
                slug: candidateSlug,
                description: input.description,
                kind: input.kind ?? "PACKAGED",
                categoryId: input.categoryId,
                featured: input.featured,
                tags: input.tags,
                images: input.images,
                youtubeLinks: input.youtubeLinks,
                attributes: input.attributes as Prisma.InputJsonValue,
                variants: { create: {
                  id: variantId,
                  name: (input.kind ?? "PACKAGED") === "PACKAGED" ? input.initialVariant.name || "Default" : "Default",
                  sku: internalSku(variantId),
                  currentSellingPrice: input.initialVariant.sellingPrice,
                  lowStockThreshold: input.initialVariant.lowStockThreshold,
                  isDefault: true,
                } },
              },
              include: { variants: true },
            });
            await transaction.sellingPriceHistory.create({ data: {
              variantId: product.variants[0].id,
              previousPrice: null,
              newPrice: input.initialVariant.sellingPrice,
              reason: input.priceReason,
              changedByProfileId: actorId,
            } });
            return product.id;
          });
          return readProduct(productId);
        } catch (error) {
          if (constraintTarget(error).includes("slug") && attempt < 99) continue;
          rethrowCatalogWriteError(error);
        }
      }
      throw catalogError(409, "DUPLICATE_SLUG", "পণ্যের জন্য আলাদা URL তৈরি করা যায়নি। আবার চেষ্টা করুন।");
    },
    async updateProduct(id: string, input: ProductUpdate) {
      try {
        await prisma.product.update({
          where: { id },
          data: { ...input, attributes: input.attributes as Prisma.InputJsonValue | undefined },
        });
        return readProduct(id);
      } catch (error) {
        rethrowCatalogWriteError(error);
      }
    },
    async changeProductKind(id: string, input: ProductKindChange, actorId: string) {
      try {
        await prisma.$transaction(async (transaction) => {
          const product = await transaction.product.findUnique({
            where: { id },
            select: {
              id: true,
              kind: true,
              variants: {
                select: {
                  id: true,
                  currentSellingPrice: true,
                  availableStock: true,
                  reservedStock: true,
                  _count: { select: { stockBatches: true, stockAdjustments: true, salesOrderItems: true, priceHistory: true } },
                },
              },
            },
          });
          if (!product) throw catalogError(404, "PRODUCT_NOT_FOUND", "Product not found");
          if (product.kind === input.kind) throw catalogError(400, "PRODUCT_KIND_UNCHANGED", "Choose a different product type.");
          if (product.variants.length !== 1) {
            throw catalogError(409, "PRODUCT_KIND_LOCKED", "A product with multiple pack/size options cannot change type.");
          }
          const variant = product.variants[0];
          const used = variant.availableStock !== 0
            || variant.reservedStock !== 0
            || variant._count.stockBatches > 0
            || variant._count.stockAdjustments > 0
            || variant._count.salesOrderItems > 0
            || variant._count.priceHistory > 1;
          if (used) {
            throw catalogError(409, "PRODUCT_KIND_LOCKED", "Product type cannot change after stock, price updates, or sales exist.");
          }
          await transaction.product.update({ where: { id }, data: { kind: input.kind } });
          const priceChanged = Number(variant.currentSellingPrice) !== Number(input.sellingPrice);
          await transaction.productVariant.update({
            where: { id: variant.id },
            data: {
              name: "Default",
              currentSellingPrice: input.sellingPrice,
              lowStockThreshold: input.lowStockThreshold,
            },
          });
          if (priceChanged) {
            await transaction.sellingPriceHistory.create({ data: {
              variantId: variant.id,
              previousPrice: variant.currentSellingPrice,
              newPrice: input.sellingPrice,
              reason: input.reason,
              changedByProfileId: actorId,
            } });
          }
          await transaction.auditLog.create({ data: {
            actorProfileId: actorId,
            action: "UNUSED_PRODUCT_KIND_CHANGED",
            entityType: "PRODUCT",
            entityId: id,
            previousData: { kind: product.kind },
            newData: { kind: input.kind, sellingPrice: input.sellingPrice, lowStockThreshold: input.lowStockThreshold },
            reason: input.reason,
          } });
        });
        return readProduct(id);
      } catch (error) {
        rethrowCatalogWriteError(error);
      }
    },
    async deleteProduct(id: string, actorId: string) {
      try {
        return await prisma.$transaction(async (transaction) => {
          const product = await transaction.product.findUnique({
            where: { id },
            select: {
              id: true,
              name: true,
              slug: true,
              isActive: true,
              isVisibleInShop: true,
              images: true,
              variants: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  currentSellingPrice: true,
                  availableStock: true,
                  reservedStock: true,
                  priceHistory: { select: { previousPrice: true }, take: 2 },
                  _count: { select: { stockBatches: true, stockAdjustments: true, salesOrderItems: true } },
                },
              },
            },
          });
          if (!product) throw catalogError(404, "PRODUCT_NOT_FOUND", "Product not found");
          const hasOperationalHistory = product.variants.some((variant) =>
            variant.availableStock !== 0
            || variant.reservedStock !== 0
            || variant._count.stockBatches > 0
            || variant._count.stockAdjustments > 0
            || variant._count.salesOrderItems > 0);
          if (hasOperationalHistory) {
            throw catalogError(409, "PRODUCT_HAS_HISTORY", "এই পণ্যের স্টক, ইনভেন্টরি বা অর্ডারের রেকর্ড আছে। তাই এটি মুছতে পারবেন না, শুধু ইনঅ্যাকটিভ করতে পারবেন।");
          }
          const hasPriceUpdates = product.variants.some((variant) =>
            variant.priceHistory.length > 1
            || variant.priceHistory.some((history) => history.previousPrice !== null));
          if (hasPriceUpdates) {
            throw catalogError(409, "PRODUCT_HAS_PRICE_UPDATES", "এই পণ্যের দাম পরিবর্তনের রেকর্ড আছে। তাই এটি মুছতে পারবেন না, শুধু ইনঅ্যাকটিভ করতে পারবেন।");
          }

          await transaction.$executeRaw`SELECT set_config('nafah.allow_unused_catalog_delete', 'on', true)`;
          await transaction.sellingPriceHistory.deleteMany({
            where: { variantId: { in: product.variants.map((variant) => variant.id) } },
          });
          await transaction.product.delete({ where: { id } });
          await transaction.auditLog.create({ data: {
            actorProfileId: actorId,
            action: "UNUSED_PRODUCT_DELETED",
            entityType: "PRODUCT",
            entityId: id,
            previousData: {
              name: product.name,
              slug: product.slug,
              isActive: product.isActive,
              isVisibleInShop: product.isVisibleInShop,
              variants: product.variants.map((variant) => ({
                id: variant.id,
                name: variant.name,
                sku: variant.sku,
                sellingPrice: variant.currentSellingPrice.toString(),
              })),
              imageUrlsRetained: product.images,
            },
            reason: "Unused product removal",
          } });
          return { id };
        });
      } catch (error) {
        if (isDeleteConstraintConflict(error)) {
          throw catalogError(409, "PRODUCT_DELETE_CONFLICT", "এই পণ্যটি এখন ব্যবহৃত হচ্ছে। তাই এটি মুছতে পারবেন না, শুধু ইনঅ্যাকটিভ করতে পারবেন।");
        }
        throw error;
      }
    },
    async createVariant(productId: string, input: VariantCreate, actorId: string) {
      try {
        await prisma.$transaction(async (transaction) => {
          const product = await transaction.product.findUnique({
            where: { id: productId },
            select: { id: true, kind: true, variants: { select: { name: true } } },
          });
          if (!product) throw catalogError(404, "PRODUCT_NOT_FOUND", "Product not found");
          if ((product.kind ?? "PACKAGED") !== "PACKAGED") {
            throw catalogError(409, "LOOSE_PRODUCT_SINGLE_OPTION", "Loose products use one measured stock and price option.");
          }
          if (product.variants.some((variant) => isUnnamedPackSize(variant.name))) {
            throw catalogError(
              409,
              "UNNAMED_DEFAULT_PACK_SIZE",
              "Name the existing default pack/size before adding another one.",
            );
          }
          if (input.isDefault) {
            await transaction.productVariant.updateMany({
              where: { productId, isDefault: true },
              data: { isDefault: false },
            });
          }
          const variantId = randomUUID();
          const variant = await transaction.productVariant.create({ data: {
            id: variantId,
            productId,
            name: input.name,
            sku: internalSku(variantId),
            currentSellingPrice: input.sellingPrice,
            lowStockThreshold: input.lowStockThreshold,
            isDefault: input.isDefault,
          } });
          await transaction.sellingPriceHistory.create({ data: {
            variantId: variant.id,
            previousPrice: null,
            newPrice: input.sellingPrice,
            reason: input.priceReason,
            changedByProfileId: actorId,
          } });
        });
        return readProduct(productId);
      } catch (error) {
        rethrowCatalogWriteError(error);
      }
    },
    async updateVariant(variantId: string, input: VariantUpdate) {
      try {
        const productId = await prisma.$transaction(async (transaction) => {
          const variant = await transaction.productVariant.findUnique({ where: { id: variantId } });
          if (!variant) throw catalogError(404, "VARIANT_NOT_FOUND", "Variant not found");

          if (input.name && isUnnamedPackSize(input.name)) {
            const packSizeCount = await transaction.productVariant.count({
              where: { productId: variant.productId },
            });
            if (packSizeCount > 1) {
              throw catalogError(409, "PACK_SIZE_NAME_REQUIRED", "Every option needs a pack/size name when a product has multiple options.");
            }
          }

          if (input.isActive === false && variant.isActive) {
            const activeCount = await transaction.productVariant.count({
              where: { productId: variant.productId, isActive: true },
            });
            if (activeCount <= 1) {
              throw catalogError(409, "LAST_ACTIVE_VARIANT", "পণ্যটিতে অন্তত একটি অ্যাকটিভ প্যাক/সাইজ রাখতে হবে।");
            }
          }
          if (input.isDefault === false && variant.isDefault && input.isActive !== false) {
            throw catalogError(409, "DEFAULT_VARIANT_REQUIRED", "Choose another default variant first.");
          }
          if (input.isDefault === true && !variant.isActive && input.isActive !== true) {
            throw catalogError(409, "DEFAULT_ACTIVE_REQUIRED", "মূল প্যাক/সাইজটি অ্যাকটিভ রাখতে হবে।");
          }

          if (input.isDefault === true) {
            await transaction.productVariant.updateMany({
              where: { productId: variant.productId, isDefault: true, id: { not: variantId } },
              data: { isDefault: false },
            });
          }
          await transaction.productVariant.update({
            where: { id: variantId },
            data: input,
          });

          if (input.isActive === false && variant.isDefault) {
            const replacement = await transaction.productVariant.findFirst({
              where: { productId: variant.productId, isActive: true, id: { not: variantId } },
              orderBy: { createdAt: "asc" },
            });
            if (!replacement) throw catalogError(409, "LAST_ACTIVE_VARIANT", "পণ্যটিতে অন্তত একটি অ্যাকটিভ প্যাক/সাইজ রাখতে হবে।");
            await transaction.productVariant.update({
              where: { id: replacement.id },
              data: { isDefault: true },
            });
          }
          return variant.productId;
        });
        return readProduct(productId);
      } catch (error) {
        rethrowCatalogWriteError(error);
      }
    },
    async changePrice(variantId: string, input: PriceChange, actorId: string) {
      const productId = await prisma.$transaction(async (transaction) => {
        const variant = await transaction.productVariant.findUnique({ where: { id: variantId } });
        if (!variant) throw catalogError(404, "VARIANT_NOT_FOUND", "Variant not found");
        if (Number(variant.currentSellingPrice) === Number(input.sellingPrice)) {
          throw catalogError(400, "PRICE_UNCHANGED", "The new selling price must be different.");
        }
        await transaction.productVariant.update({
          where: { id: variantId },
          data: { currentSellingPrice: input.sellingPrice },
        });
        await transaction.sellingPriceHistory.create({ data: {
          variantId,
          previousPrice: variant.currentSellingPrice,
          newPrice: input.sellingPrice,
          reason: input.reason,
          changedByProfileId: actorId,
        } });
        return variant.productId;
      });
      return readProduct(productId);
    },
    async bulkChangePrices(input: BulkPriceChange, actorId: string) {
      const productIds = await prisma.$transaction(async (transaction) => {
        const variantIds = input.updates.map((update) => update.variantId);
        const variants = await transaction.productVariant.findMany({ where: { id: { in: variantIds } } });
        if (variants.length !== variantIds.length) {
          throw catalogError(404, "VARIANT_NOT_FOUND", "One or more variants were not found; no prices were changed.");
        }
        const byId = new Map(variants.map((variant) => [variant.id, variant]));
        for (const update of input.updates) {
          const variant = byId.get(update.variantId)!;
          if (Number(variant.currentSellingPrice) === Number(update.sellingPrice)) {
            throw catalogError(400, "PRICE_UNCHANGED", `The selling price for ${variant.name} is unchanged; no prices were changed.`);
          }
          await transaction.productVariant.update({
            where: { id: update.variantId },
            data: { currentSellingPrice: update.sellingPrice },
          });
          await transaction.sellingPriceHistory.create({ data: {
            variantId: update.variantId,
            previousPrice: variant.currentSellingPrice,
            newPrice: update.sellingPrice,
            reason: input.reason,
            changedByProfileId: actorId,
          } });
        }
        return [...new Set(variants.map((variant) => variant.productId))];
      });
      return Promise.all(productIds.map((productId) => readProduct(productId)));
    },
    getPriceHistory(variantId: string) {
      return prisma.sellingPriceHistory.findMany({
        where: { variantId },
        orderBy: { effectiveAt: "desc" },
        select: {
          id: true,
          previousPrice: true,
          newPrice: true,
          reason: true,
          changedByProfileId: true,
          changedBy: { select: { fullName: true, role: true } },
          effectiveAt: true,
        },
      }).then((items) => items.map((item) => ({
        ...item,
        previousPrice: item.previousPrice === null ? null : Number(item.previousPrice),
        newPrice: Number(item.newPrice),
      })));
    },
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;
