import { describe, expect, it } from "vitest";
import { Prisma } from "../generated/prisma/client.js";
import { allocateSaleAmount } from "./saleAdjustment.js";

describe("sale amount allocation", () => {
  it("spreads a discount across many low-priced items without over-discounting a line", () => {
    const lines = Array.from({ length: 100 }, () => new Prisma.Decimal("0.01"));
    const shares = allocateSaleAmount(lines, new Prisma.Decimal("1.00"), new Prisma.Decimal("0.49"));
    expect(shares.reduce((sum, share) => sum.plus(share), new Prisma.Decimal(0)).toString()).toBe("0.49");
    expect(shares.every((share) => share.gte(0) && share.lte("0.01"))).toBe(true);
    expect(shares.filter((share) => share.eq("0.01"))).toHaveLength(49);
  });

  it("allocates a price increase exactly to the cent", () => {
    const shares = allocateSaleAmount(
      [new Prisma.Decimal("0.01"), new Prisma.Decimal("0.01"), new Prisma.Decimal("0.01")],
      new Prisma.Decimal("0.03"),
      new Prisma.Decimal("0.10"),
    );
    expect(shares.map(String)).toEqual(["0.04", "0.03", "0.03"]);
  });
});
