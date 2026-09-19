import { Prisma } from "../generated/prisma/client.js";

export type ProductKindValue = "PACKAGED" | "LOOSE_WEIGHT" | "LOOSE_VOLUME" | "EGG";
export type AmountUnit = "PIECE" | "KG" | "G" | "LITER" | "ML";
export type QuantityUnitValue = "PIECE" | "GRAM" | "MILLILITER";

const MAX_BASE_QUANTITY = 2_000_000_000;

export function quantityUnitForKind(kind: ProductKindValue): QuantityUnitValue {
  if (kind === "LOOSE_WEIGHT") return "GRAM";
  if (kind === "LOOSE_VOLUME") return "MILLILITER";
  return "PIECE";
}

export function quantityScale(kind: ProductKindValue) {
  return kind === "LOOSE_WEIGHT" || kind === "LOOSE_VOLUME" ? 1_000 : 1;
}

export function allowedAmountUnits(kind: ProductKindValue): AmountUnit[] {
  if (kind === "LOOSE_WEIGHT") return ["KG", "G"];
  if (kind === "LOOSE_VOLUME") return ["LITER", "ML"];
  return ["PIECE"];
}

export function toBaseQuantity(amount: string, amountUnit: AmountUnit, kind: ProductKindValue) {
  if (!allowedAmountUnits(kind).includes(amountUnit)) {
    throw Object.assign(new Error("The amount unit does not match the product type."), {
      status: 400,
      code: "INCOMPATIBLE_AMOUNT_UNIT",
    });
  }
  const value = new Prisma.Decimal(amount);
  const multiplier = amountUnit === "KG" || amountUnit === "LITER" ? 1_000 : 1;
  const base = value.mul(multiplier);
  if (!base.isInteger() || base.lte(0) || base.gt(MAX_BASE_QUANTITY)) {
    throw Object.assign(new Error("The amount must resolve to a positive whole piece, gram, or millilitre."), {
      status: 400,
      code: "INVALID_MEASURED_AMOUNT",
    });
  }
  return base.toNumber();
}

export function quantityCost(
  rate: Prisma.Decimal | string | number,
  baseQuantity: number,
  kind: ProductKindValue,
) {
  return new Prisma.Decimal(rate)
    .mul(baseQuantity)
    .div(quantityScale(kind))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
