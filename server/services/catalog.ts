import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import type {
  BulkPriceChange,
  CategoryCreate,
  CategoryUpdate,
  PriceChange,
  ProductCreate,
  ProductList,
  ProductUpdate,
  VariantCreate,
  VariantUpdate,
} from "../schemas/catalog.js";

const productInclude = {
  category: { select: { id: true, name: true, slug: true, isActive: true } },
  variants: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
} satisfies Prisma.ProductInclude;

type ProductRecord = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

function catalogError(status: number, code: string, message: string) {
  return Object.assign(new Error(message), { status, code });
}

function constraintTarget(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== "P2002") return "";
  return JSON.stringify(candidate.meta?.target ?? "").toLowerCase();
}

function rethrowCatalogWriteError(error: unknown): never {
  const target = constraintTarget(error);
  if (target.includes("sku")) throw catalogError(409, "DUPLICATE_SKU", "That SKU is already in use.");
  if (target.includes("slug")) throw catalogError(409, "DUPLICATE_SLUG", "That slug is already in use.");
  throw error;
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
    categoryId: product.categoryId,
    category: product.category,
    featured: product.featured,
    isActive: product.isActive,
    tags: product.tags,
    images: product.images,
    youtubeLinks: product.youtubeLinks,
    attributes: product.attributes,
    price: defaultVariant ? Number(defaultVariant.currentSellingPrice) : 0,
    stock: visibleVariants.reduce((total, variant) => total + variant.availableStock, 0),
    sku: defaultVariant?.sku,
    variantName: defaultVariant?.name,
    defaultVariantId: defaultVariant?.id,
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
    const product = await prisma.product.findUnique({ where: { id }, include: productInclude });
    if (!product) throw catalogError(404, "PRODUCT_NOT_FOUND", "Product not found");
    return productDto(product, includeInactiveVariants);
  }

  return {
    listCategories(includeInactive = false) {
      return prisma.category.findMany({
        where: includeInactive ? undefined : { isActive: true },
        orderBy: { name: "asc" },
      });
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
    async listProducts(input: ProductList, includeInactive = false) {
      const where: Prisma.ProductWhereInput = {
        ...(includeInactive ? {} : { isActive: true, category: {
          isActive: true,
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
      const [records, total] = await prisma.$transaction([
        prisma.product.findMany({
          where,
          include: productInclude,
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
        where: { slug, isActive: true, category: { isActive: true } },
        include: productInclude,
      });
      if (!product) throw catalogError(404, "PRODUCT_NOT_FOUND", "Product not found");
      return productDto(product, false);
    },
    async createProduct(input: ProductCreate, actorId: string) {
      try {
        const productId = await prisma.$transaction(async (transaction) => {
          const product = await transaction.product.create({
            data: {
              name: input.name,
              slug: input.slug,
              description: input.description,
              categoryId: input.categoryId,
              featured: input.featured,
              tags: input.tags,
              images: input.images,
              youtubeLinks: input.youtubeLinks,
              attributes: input.attributes as Prisma.InputJsonValue,
              variants: { create: {
                name: input.initialVariant.name || "Default",
                sku: input.initialVariant.sku,
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
        rethrowCatalogWriteError(error);
      }
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
    async createVariant(productId: string, input: VariantCreate, actorId: string) {
      try {
        await prisma.$transaction(async (transaction) => {
          const product = await transaction.product.findUnique({ where: { id: productId }, select: { id: true } });
          if (!product) throw catalogError(404, "PRODUCT_NOT_FOUND", "Product not found");
          if (input.isDefault) {
            await transaction.productVariant.updateMany({
              where: { productId, isDefault: true },
              data: { isDefault: false },
            });
          }
          const variant = await transaction.productVariant.create({ data: {
            productId,
            name: input.name,
            sku: input.sku,
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

          if (input.isActive === false && variant.isActive) {
            const activeCount = await transaction.productVariant.count({
              where: { productId: variant.productId, isActive: true },
            });
            if (activeCount <= 1) {
              throw catalogError(409, "LAST_ACTIVE_VARIANT", "A product must keep at least one active variant.");
            }
          }
          if (input.isDefault === false && variant.isDefault && input.isActive !== false) {
            throw catalogError(409, "DEFAULT_VARIANT_REQUIRED", "Choose another default variant first.");
          }
          if (input.isDefault === true && !variant.isActive && input.isActive !== true) {
            throw catalogError(409, "DEFAULT_ACTIVE_REQUIRED", "A default variant must be active.");
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
            if (!replacement) throw catalogError(409, "LAST_ACTIVE_VARIANT", "A product must keep at least one active variant.");
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
            throw catalogError(400, "PRICE_UNCHANGED", `The selling price for SKU ${variant.sku} is unchanged; no prices were changed.`);
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
