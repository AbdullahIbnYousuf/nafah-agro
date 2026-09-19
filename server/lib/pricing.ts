import { Prisma } from "../generated/prisma/client.js";
import { quantityCost, type ProductKindValue } from "./quantity.js";

export const EGG_BULK_MINIMUM_QUANTITY = 15;

export type SellingPriceTierValue = "REGULAR" | "EGG_BULK";

export function validateEggPrices(
  regularPrice: Prisma.Decimal | string | number,
  bulkPrice: Prisma.Decimal | string | number | null | undefined,
) {
  const regular = new Prisma.Decimal(regularPrice);
  if (bulkPrice === null || bulkPrice === undefined) {
    throw Object.assign(new Error("ডিমের 15টি বা তার বেশি দামের রেট দিন।"), {
      status: 400,
      code: "EGG_BULK_PRICE_REQUIRED",
    });
  }
  const bulk = new Prisma.Decimal(bulkPrice);
  if (regular.lte(0) || bulk.lte(0) || bulk.gte(regular)) {
    throw Object.assign(new Error("15টি বা তার বেশি ডিমের দাম সাধারণ দামের চেয়ে কম হতে হবে।"), {
      status: 400,
      code: "INVALID_EGG_PRICES",
    });
  }
}

export function sellingPriceForQuantity(input: {
  kind: ProductKindValue;
  regularPrice: Prisma.Decimal | string | number;
  bulkPrice?: Prisma.Decimal | string | number | null;
  baseQuantity: number;
}) {
  if (input.kind === "EGG" && input.baseQuantity >= EGG_BULK_MINIMUM_QUANTITY) {
    validateEggPrices(input.regularPrice, input.bulkPrice);
    return {
      unitPrice: new Prisma.Decimal(input.bulkPrice!),
      tier: "EGG_BULK" as const,
      lineTotal: quantityCost(input.bulkPrice!, input.baseQuantity, input.kind),
    };
  }
  return {
    unitPrice: new Prisma.Decimal(input.regularPrice),
    tier: "REGULAR" as const,
    lineTotal: quantityCost(input.regularPrice, input.baseQuantity, input.kind),
  };
}
