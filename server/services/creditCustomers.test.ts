// @vitest-environment node

import { describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import { creditFollowUpSchema, creditPaymentCreateSchema, creditPaymentVoidSchema, creditCustomerUpdateSchema } from "../schemas/inventory.js";
import { createInventoryService } from "./inventory.js";

const CUSTOMER_ID = "10000000-0000-4000-8000-000000000001";
const OWNER_ID = "20000000-0000-4000-8000-000000000001";
const SALE_1 = "30000000-0000-4000-8000-000000000001";
const SALE_2 = "30000000-0000-4000-8000-000000000002";

function dateOffset(days = 0) {
  const value = new Date(Date.now() + 6 * 60 * 60 * 1_000);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function setup() {
  let sequence = 1;
  const id = () => `40000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`;
  const creator = { fullName: "Owner", role: "OWNER" as const };
  const customer = {
    id: CUSTOMER_ID, name: "Rahim", normalizedName: "rahim", phone: null as string | null,
    nextFollowUpDate: new Date(`${dateOffset(7)}T00:00:00.000Z`), createdByProfileId: OWNER_ID,
    createdAt: new Date("2026-09-01T00:00:00Z"), updatedAt: new Date("2026-09-01T00:00:00Z"), createdBy: creator,
  };
  const sales = [
    { id: SALE_1, grandTotal: new Prisma.Decimal(500), completedAt: new Date("2026-09-01T00:00:00Z"), createdAt: new Date("2026-09-01T00:00:00Z"), physicalSaleReturns: [] as Array<{ refundAmount: Prisma.Decimal; cashRefundAmount: Prisma.Decimal }>, paymentStatus: "UNPAID" },
    { id: SALE_2, grandTotal: new Prisma.Decimal(300), completedAt: new Date("2026-09-02T00:00:00Z"), createdAt: new Date("2026-09-02T00:00:00Z"), physicalSaleReturns: [] as Array<{ refundAmount: Prisma.Decimal; cashRefundAmount: Prisma.Decimal }>, paymentStatus: "UNPAID" },
  ];
  const payments: Array<Record<string, unknown>> = [];
  const allocations: Array<{ id: string; creditPaymentId: string; salesOrderId: string; amount: Prisma.Decimal; createdAt: Date }> = [];
  const audits: Array<Record<string, unknown>> = [];

  const hydrateCustomer = () => ({
    ...customer,
    sales: sales.map((sale) => ({
      ...sale,
      creditPaymentAllocations: allocations.filter((allocation) => allocation.salesOrderId === sale.id).map((allocation) => ({ ...allocation, creditPayment: { voidedAt: payments.find((payment) => payment.id === allocation.creditPaymentId)?.voidedAt ?? null } })),
    })),
    payments: payments.map((payment) => ({
      ...payment,
      amount: new Prisma.Decimal(String(payment.amount)),
      createdBy: creator,
      voidedBy: payment.voidedAt ? creator : null,
      allocations: allocations.filter((allocation) => allocation.creditPaymentId === payment.id),
    })),
  });

  let tail: Promise<void> = Promise.resolve();
  const api = {
    creditCustomer: {
      findUnique: async () => hydrateCustomer(),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        if (data.name !== undefined) customer.name = String(data.name);
        if (data.normalizedName !== undefined) customer.normalizedName = String(data.normalizedName);
        if (Object.prototype.hasOwnProperty.call(data, "phone")) customer.phone = data.phone as string | null;
        if (Object.prototype.hasOwnProperty.call(data, "nextFollowUpDate")) customer.nextFollowUpDate = data.nextFollowUpDate as Date | null;
        customer.updatedAt = new Date();
        return customer;
      },
    },
    creditCustomerPayment: {
      findUnique: async ({ where }: { where: { idempotencyKey?: string; id?: string } }) => payments.find((payment) => where.idempotencyKey ? payment.idempotencyKey === where.idempotencyKey : payment.id === where.id) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: id(), ...data, amount: String(data.amount), createdAt: new Date(), voidedAt: null, voidedByProfileId: null, voidReason: null };
        payments.push(row); return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const payment = payments.find((value) => value.id === where.id)!; Object.assign(payment, data); return payment;
      },
    },
    creditCustomerPaymentAllocation: {
      deleteMany: async () => { allocations.splice(0); return { count: 0 }; },
      create: async ({ data }: { data: { creditPaymentId: string; salesOrderId: string; amount: Prisma.Decimal } }) => {
        const row = { id: id(), ...data, createdAt: new Date() }; allocations.push(row); return row;
      },
    },
    salesOrder: {
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const sale = sales.find((value) => value.id === where.id)!; if (data.paymentStatus) sale.paymentStatus = String(data.paymentStatus); return sale;
      },
      updateMany: async () => ({ count: sales.length }),
      findMany: async () => [],
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => { const row = { id: id(), ...data, createdAt: new Date() }; audits.push(row); return row; },
      findMany: async () => [],
    },
    $queryRaw: async () => [{ id: CUSTOMER_ID }],
    $transaction: async (operation: (transaction: unknown) => Promise<unknown>) => {
      let release!: () => void; const previous = tail; tail = new Promise<void>((resolve) => { release = resolve; }); await previous;
      try { return await operation(api); } finally { release(); }
    },
  };
  return { service: createInventoryService(api as unknown as PrismaClient), customer, sales, payments, allocations, audits };
}

function payment(amount: string, key: string) {
  return creditPaymentCreateSchema.parse({ idempotencyKey: key, amount, paidOn: dateOffset(), note: "Received" });
}

describe("customer-based credit ledger", () => {
  it("allocates one customer payment to the oldest outstanding sales", async () => {
    const { service, allocations, sales } = setup();
    const result = await service.recordCreditCustomerPayment(CUSTOMER_ID, payment("600", "50000000-0000-4000-8000-000000000001"), OWNER_ID);
    expect(result).toMatchObject({ collectedAmount: 600, outstandingAmount: 200 });
    expect(allocations.map((value) => ({ sale: value.salesOrderId, amount: Number(value.amount) }))).toEqual([
      { sale: SALE_1, amount: 500 }, { sale: SALE_2, amount: 100 },
    ]);
    expect(sales.map((sale) => sale.paymentStatus)).toEqual(["PAID", "PARTIALLY_PAID"]);
  });

  it("makes retries idempotent and serializes concurrent overpayments", async () => {
    const { service, payments } = setup();
    const same = payment("100", "50000000-0000-4000-8000-000000000002");
    await service.recordCreditCustomerPayment(CUSTOMER_ID, same, OWNER_ID);
    await service.recordCreditCustomerPayment(CUSTOMER_ID, same, OWNER_ID);
    expect(payments).toHaveLength(1);
    const results = await Promise.allSettled([
      service.recordCreditCustomerPayment(CUSTOMER_ID, payment("400", "50000000-0000-4000-8000-000000000003"), OWNER_ID),
      service.recordCreditCustomerPayment(CUSTOMER_ID, payment("400", "50000000-0000-4000-8000-000000000004"), OWNER_ID),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("voids a payment with a reason and restores the customer balance", async () => {
    const { service, payments } = setup();
    await service.recordCreditCustomerPayment(CUSTOMER_ID, payment("600", "50000000-0000-4000-8000-000000000005"), OWNER_ID);
    const result = await service.voidCreditCustomerPayment(CUSTOMER_ID, String(payments[0].id), creditPaymentVoidSchema.parse({ reason: "Wrong entry" }), OWNER_ID);
    expect(result).toMatchObject({ collectedAmount: 0, outstandingAmount: 800 });
    expect(payments[0].voidReason).toBe("Wrong entry");
  });

  it("edits the unique display data and changes one customer follow-up date", async () => {
    const { service, customer, audits } = setup();
    await service.updateCreditCustomer(CUSTOMER_ID, creditCustomerUpdateSchema.parse({ name: "  Karim  ", phone: null }), OWNER_ID);
    expect(customer).toMatchObject({ name: "Karim", normalizedName: "karim", phone: null });
    await service.rescheduleCreditCustomerFollowUp(CUSTOMER_ID, creditFollowUpSchema.parse({ nextFollowUpDate: dateOffset(10) }), OWNER_ID);
    expect(customer.nextFollowUpDate?.toISOString().slice(0, 10)).toBe(dateOffset(10));
    expect(audits.map((entry) => entry.action)).toEqual(expect.arrayContaining(["CREDIT_CUSTOMER_UPDATED", "CREDIT_CUSTOMER_FOLLOW_UP_CHANGED"]));
  });
});
