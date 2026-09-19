// @vitest-environment node

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { EGG_BULK_MINIMUM_QUANTITY, sellingPriceForQuantity, validateEggPrices } from "./pricing.js";

describe("egg tier pricing", () => {
  it("uses the regular rate for 1 and 14 eggs", () => {
    for (const quantity of [1, 14]) {
      const result = sellingPriceForQuantity({ kind: "EGG", regularPrice: "12", bulkPrice: "10", baseQuantity: quantity });
      expect(result.tier).toBe("REGULAR");
      expect(result.unitPrice.toNumber()).toBe(12);
      expect(result.lineTotal.toNumber()).toBe(12 * quantity);
    }
  });

  it("uses the lower rate for the whole line at 15 and 16 eggs", () => {
    expect(EGG_BULK_MINIMUM_QUANTITY).toBe(15);
    for (const quantity of [15, 16]) {
      const result = sellingPriceForQuantity({ kind: "EGG", regularPrice: "12", bulkPrice: "10", baseQuantity: quantity });
      expect(result.tier).toBe("EGG_BULK");
      expect(result.unitPrice.toNumber()).toBe(10);
      expect(result.lineTotal.toNumber()).toBe(10 * quantity);
    }
  });

  it("validates positive paired egg prices", () => {
    expect(() => validateEggPrices("12", "10")).not.toThrow();
    expect(() => validateEggPrices("12", undefined)).toThrowError(expect.objectContaining({ code: "EGG_BULK_PRICE_REQUIRED" }));
    expect(() => validateEggPrices("12", "12")).toThrowError(expect.objectContaining({ code: "INVALID_EGG_PRICES" }));
    expect(() => validateEggPrices("12", "13")).toThrowError(expect.objectContaining({ code: "INVALID_EGG_PRICES" }));
    expect(() => validateEggPrices("0", "0")).toThrowError(expect.objectContaining({ code: "INVALID_EGG_PRICES" }));
  });

  it("calculates the threshold independently for each egg product", () => {
    const first = sellingPriceForQuantity({ kind: "EGG", regularPrice: 12, bulkPrice: 10, baseQuantity: 10 });
    const second = sellingPriceForQuantity({ kind: "EGG", regularPrice: 15, bulkPrice: 13, baseQuantity: 5 });
    expect(first.tier).toBe("REGULAR");
    expect(second.tier).toBe("REGULAR");
  });

  it("adds egg pricing without rewriting existing products or quantities", () => {
    const migration = readFileSync("prisma/migrations/202609200001_egg_pricing/migration.sql", "utf8");
    expect(migration).toContain("ALTER TYPE \"ProductKind\" ADD VALUE IF NOT EXISTS 'EGG'");
    expect(migration).toContain("ADD COLUMN \"bulk_selling_price\"");
    expect(migration).toContain("ADD COLUMN \"selling_price_tier\"");
    expect(migration).not.toMatch(/UPDATE\s+"?(?:products|product_variants|sales_order_items)"?/i);
  });
});
