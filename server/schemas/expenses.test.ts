import { describe, expect, it } from "vitest";
import { expenseCreateSchema, expenseListSchema, expenseUpdateSchema, expenseVoidSchema } from "./expenses.js";

const valid = {
  name: "  বিদ্যুৎ   বিল  ",
  amount: "500.50",
  paidOn: "2026-09-01",
  idempotencyKey: "10000000-0000-4000-8000-000000000001",
};

describe("paid shop expense validation", () => {
  it("normalizes names and defaults the payment method to cash", () => {
    expect(expenseCreateSchema.parse(valid)).toMatchObject({ name: "বিদ্যুৎ বিল", paymentChannel: "CASH", amount: "500.50" });
  });
  it("accepts each supported payment method", () => {
    for (const method of ["CASH", "BKASH", "NAGAD", "ROCKET", "BANK"]) {
      expect(expenseCreateSchema.safeParse({ ...valid, paymentChannel: method }).success).toBe(true);
    }
  });
  it("rejects zero, excess precision, invalid dates, future payments, and unknown methods", () => {
    for (const patch of [
      { amount: "0" }, { amount: "-1" }, { amount: "1.001" },
      { paidOn: "2026-02-30" }, { paidOn: "2099-01-01" }, { paymentChannel: "CARD" },
    ]) expect(expenseCreateSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
  it("requires a reason for corrections and voiding", () => {
    const update = { name: "ভাড়া", amount: "100", paidOn: "2026-09-01", paymentChannel: "BANK" };
    expect(expenseUpdateSchema.safeParse({ ...update, reason: "না" }).success).toBe(false);
    expect(expenseUpdateSchema.safeParse({ ...update, reason: "ভুল টাকা" }).success).toBe(true);
    expect(expenseVoidSchema.safeParse({ reason: "" }).success).toBe(false);
  });
  it("validates filtering and pagination", () => {
    expect(expenseListSchema.safeParse({ from: "2026-09-30", to: "2026-09-01" }).success).toBe(false);
    expect(expenseListSchema.safeParse({ from: "2026-02-30" }).success).toBe(false);
    expect(expenseListSchema.safeParse({ page: "2", limit: "20", status: "VOIDED" }).success).toBe(true);
  });
});
