import { Prisma } from "../generated/prisma/client.js";

/** Allocate a transaction-level amount without losing or inventing cents. */
export function allocateSaleAmount(lineTotals: Prisma.Decimal[], subtotal: Prisma.Decimal, amount: Prisma.Decimal) {
  if (amount.isZero()) return lineTotals.map(() => new Prisma.Decimal(0));
  if (subtotal.isZero()) return lineTotals.map((_, index) => index === lineTotals.length - 1 ? amount : new Prisma.Decimal(0));
  const shares = lineTotals.map((lineTotal, index) => {
    const exactCents = lineTotal.mul(amount).div(subtotal).mul(100);
    const wholeCents = exactCents.floor();
    return { index, cents: wholeCents, fraction: exactCents.minus(wholeCents) };
  });
  const assigned = shares.reduce((sum, share) => sum.plus(share.cents), new Prisma.Decimal(0));
  const remainingCents = amount.mul(100).minus(assigned).toNumber();
  for (const share of [...shares].sort((left, right) => right.fraction.comparedTo(left.fraction) || left.index - right.index).slice(0, remainingCents)) {
    share.cents = share.cents.plus(1);
  }
  return shares.map((share) => share.cents.div(100));
}
