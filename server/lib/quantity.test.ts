// @vitest-environment node

import { describe, expect, it } from "vitest";
import { quantityCost, quantityUnitForKind, toBaseQuantity } from "./quantity.js";

describe("measured quantity conversion", () => {
  it("converts kg, grams, litres, and millilitres to exact base quantities", () => {
    expect(toBaseQuantity("1.25", "KG", "LOOSE_WEIGHT")).toBe(1_250);
    expect(toBaseQuantity("250", "G", "LOOSE_WEIGHT")).toBe(250);
    expect(toBaseQuantity("0.5", "LITER", "LOOSE_VOLUME")).toBe(500);
    expect(toBaseQuantity("500", "ML", "LOOSE_VOLUME")).toBe(500);
    expect(quantityUnitForKind("LOOSE_WEIGHT")).toBe("GRAM");
    expect(quantityUnitForKind("LOOSE_VOLUME")).toBe("MILLILITER");
    expect(toBaseQuantity("15", "PIECE", "EGG")).toBe(15);
    expect(quantityUnitForKind("EGG")).toBe("PIECE");
  });

  it("rejects incompatible and sub-gram quantities", () => {
    expect(() => toBaseQuantity("1", "LITER", "LOOSE_WEIGHT")).toThrowError(expect.objectContaining({ code: "INCOMPATIBLE_AMOUNT_UNIT" }));
    expect(() => toBaseQuantity("0.0001", "KG", "LOOSE_WEIGHT")).toThrowError(expect.objectContaining({ code: "INVALID_MEASURED_AMOUNT" }));
    expect(() => toBaseQuantity("1.5", "G", "LOOSE_WEIGHT")).toThrowError(expect.objectContaining({ code: "INVALID_MEASURED_AMOUNT" }));
    expect(() => toBaseQuantity("1.5", "PIECE", "EGG")).toThrowError(expect.objectContaining({ code: "INVALID_MEASURED_AMOUNT" }));
  });

  it("calculates buying and selling values from kg and litre rates", () => {
    expect(quantityCost("60.00", 1_250, "LOOSE_WEIGHT").toFixed(2)).toBe("75.00");
    expect(quantityCost("140.00", 500, "LOOSE_VOLUME").toFixed(2)).toBe("70.00");
  });
});
