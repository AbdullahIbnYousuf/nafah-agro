import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import { z } from "zod";
import { SERIALIZABLE_TRANSACTION_OPTIONS } from "../lib/transactions.js";
import { sellingPriceForQuantity } from "../lib/pricing.js";

export const cartLineSchema = z.object({
  productVariantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(1_000_000),
  productName: z.string().max(200).optional(),
  variantName: z.string().max(200).optional(),
}).strict();
export const cartLinesSchema = z.array(cartLineSchema).max(100).refine(
  lines => new Set(lines.map(line => line.productVariantId)).size === lines.length,
  "Each pack/size may appear only once",
);
export type CartLine = z.infer<typeof cartLineSchema>;
export const cartError = (status: number, code: string, message: string) => Object.assign(new Error(message), { status, code });

export function storedCartLines(items: unknown): CartLine[] {
  return cartLinesSchema.parse(items);
}

export function mergeCartLines(current: CartLine[], incoming: CartLine[]) {
  const result = current.map(line => ({ ...line }));
  for (const line of incoming) {
    const existing = result.find(item => item.productVariantId === line.productVariantId);
    if (existing) existing.quantity += line.quantity;
    else result.push({ ...line });
  }
  const parsed = cartLinesSchema.safeParse(result);
  if (!parsed.success) throw cartError(400, "CART_LIMIT", "কার্টের পরিমাণ বেশি হয়েছে। কিছু পণ্য রিমুভ করে রিট্রাই করুন।");
  return parsed.data;
}

export async function lockAccountCart(transaction: Prisma.TransactionClient, profileId: string) {
  // INSERT avoids an upsert-update writing a stale version during concurrent reads.
  await transaction.$executeRaw`INSERT INTO account_carts (profile_id) VALUES (${profileId}::uuid) ON CONFLICT DO NOTHING`;
  await transaction.$queryRaw`SELECT profile_id FROM account_carts WHERE profile_id = ${profileId}::uuid FOR UPDATE`;
  return transaction.accountCart.findUniqueOrThrow({ where: { profileId } });
}

export function requireCartRevision(actual: number, expected: number) {
  if (actual !== expected) throw cartError(409, "CART_CONFLICT", "অন্য ডিভাইসে কার্ট আপডেট হয়েছে। নতুন কার্ট দেখে রিট্রাই করুন।");
}

export function createCartService(prisma: PrismaClient) {
  async function preview(lines: CartLine[]) {
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: lines.map(line => line.productVariantId) } },
      select: {
        id: true, productId: true, name: true, unitLabel: true, currentSellingPrice: true,
        bulkSellingPrice: true, availableStock: true, isActive: true,
        product: { select: { name: true, kind: true, images: true, isActive: true, isVisibleInShop: true,
          category: { select: { isActive: true, isVisibleInShop: true } } } },
      },
    });
    return lines.map(line => {
      const variant = variants.find(item => item.id === line.productVariantId);
      const available = Boolean(variant && variant.isActive && variant.product.isActive
        && variant.product.isVisibleInShop && variant.product.category.isActive
        && variant.product.category.isVisibleInShop && ["PACKAGED", "EGG"].includes(variant.product.kind));
      const price = variant ? sellingPriceForQuantity({ kind: variant.product.kind, regularPrice: variant.currentSellingPrice, bulkPrice: variant.bulkSellingPrice, baseQuantity: line.quantity }) : null;
      return {
        productVariantId: line.productVariantId, quantity: line.quantity,
        productId: variant?.productId ?? "", productName: variant?.product.name ?? line.productName ?? "পণ্যটি পাওয়া যাচ্ছে না",
        variantName: variant?.name ?? line.variantName ?? "", unitLabel: variant?.unitLabel ?? "ইউনিট",
        productKind: variant?.product.kind ?? "PACKAGED", imageUrl: variant?.product.images[0],
        unitPrice: Number(variant?.currentSellingPrice ?? 0),
        bulkSellingPrice: variant?.bulkSellingPrice == null ? null : Number(variant.bulkSellingPrice),
        bulkMinimumQuantity: variant?.product.kind === "EGG" ? 15 : null,
        availableStock: variant?.availableStock ?? 0, available,
        unavailableReason: available ? null : "এই পণ্য এখন অনলাইনে অর্ডার করা যাচ্ছে না। কার্ট থেকে রিমুভ করুন।",
        lineTotal: available && price ? Number(price.unitPrice.mul(line.quantity).toDecimalPlaces(2)) : 0,
      };
    });
  }
  async function response(profileId: string) {
    const cart = await prisma.accountCart.findUnique({ where: { profileId } });
    return { revision: cart?.revision ?? 0, items: await preview(storedCartLines(cart?.items ?? [])) };
  }
  async function write(profileId: string, action: (transaction: Prisma.TransactionClient) => Promise<void>) {
    try {
      await prisma.$transaction(action, SERIALIZABLE_TRANSACTION_OPTIONS);
      return await response(profileId);
    } catch (error) {
      if ((error as { code?: string })?.code === "P2034") throw cartError(409, "CART_CONFLICT", "কার্ট আপডেট হয়েছে। রিফ্রেশ করে রিট্রাই করুন।");
      throw error;
    }
  }
  return {
    preview, read: response,
    async mutate(profileId: string, revision: number, action: "ADD" | "SET" | "REMOVE" | "CLEAR", line?: CartLine) {
      return write(profileId, async transaction => {
        const cart = await lockAccountCart(transaction, profileId);
        requireCartRevision(cart.revision, revision);
        let lines = storedCartLines(cart.items);
        if (action === "CLEAR") lines = [];
        else if (line) {
          if (action === "REMOVE") lines = lines.filter(item => item.productVariantId !== line.productVariantId);
          else {
            const [option] = await preview([line]);
            if (!option.available) throw cartError(400, "CART_ITEM_UNAVAILABLE", option.unavailableReason!);
            const snapshot = { productVariantId: line.productVariantId, quantity: line.quantity, productName: option.productName, variantName: option.variantName };
            if (action === "ADD") lines = mergeCartLines(lines, [snapshot]);
            else lines = mergeCartLines(lines.filter(item => item.productVariantId !== line.productVariantId), [snapshot]);
          }
        }
        await transaction.accountCart.update({ where: { profileId }, data: { items: lines, revision: { increment: 1 } } });
      });
    },
    async merge(profileId: string, mergeKey: string, incoming: CartLine[]) {
      return write(profileId, async transaction => {
        const cart = await lockAccountCart(transaction, profileId);
        if (await transaction.cartMergeReceipt.findUnique({ where: { profileId_mergeKey: { profileId, mergeKey } } })) return;
        const lines = mergeCartLines(storedCartLines(cart.items), incoming);
        await transaction.accountCart.update({ where: { profileId }, data: { items: lines, revision: { increment: 1 } } });
        await transaction.cartMergeReceipt.create({ data: { profileId, mergeKey } });
      });
    },
  };
}
export type CartService = ReturnType<typeof createCartService>;
