// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import { createExpenseService } from "./expenses.js";

function harness() {
  const records = new Map<string, Record<string, unknown>>();
  const audits: Array<Record<string, unknown>> = [];
  const owner = { fullName: "Owner" };
  const shopExpense = {
    findUnique: vi.fn(async ({ where }: { where: { id?: string; idempotencyKey?: string } }) => {
      return [...records.values()].find((record) => where.id ? record.id === where.id : record.idempotencyKey === where.idempotencyKey) ?? null;
    }),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => records.get(where.id)!),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const record = { ...data, id: "10000000-0000-4000-8000-000000000100", createdAt: new Date("2026-09-02T00:00:00Z"), updatedAt: new Date("2026-09-02T00:00:00Z"), voidedAt: null, voidReason: null, voidedBy: null, createdBy: owner };
      records.set(record.id, record);
      return record;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const record = { ...records.get(where.id)!, ...data, updatedAt: new Date("2026-09-03T00:00:00Z") };
      records.set(where.id, record);
      return record;
    }),
    groupBy: vi.fn(async () => [...records.values()].filter((record) => !record.voidedAt).map((record) => ({ paymentChannel: record.paymentChannel, _sum: { amount: record.amount }, _count: { _all: 1 } }))),
    findMany: vi.fn(async () => [...records.values()]),
    count: vi.fn(async () => records.size),
  };
  const auditLog = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const entry = { ...data, id: "20000000-0000-4000-8000-000000000200", actor: owner, createdAt: new Date("2026-09-03T00:00:00Z") };
      audits.push(entry);
      return entry;
    }),
    findMany: vi.fn(async ({ where }: { where: { entityId: string } }) => audits.filter((entry) => entry.entityId === where.entityId)),
  };
  const prisma = { shopExpense, auditLog, $transaction: async (run: (client: unknown) => Promise<unknown>) => run({ shopExpense, auditLog }) } as unknown as PrismaClient;
  return { service: createExpenseService(prisma), shopExpense, audits };
}

const createInput = {
  name: "বিদ্যুৎ বিল", amount: "100.00", paidOn: "2026-09-01", paymentChannel: "CASH" as const,
  idempotencyKey: "30000000-0000-4000-8000-000000000300", note: undefined,
};
const ownerId = "40000000-0000-4000-8000-000000000400";

describe("shop expense service", () => {
  it("creates once, audits entry, and replays only the same idempotent request", async () => {
    const { service, shopExpense, audits } = harness();
    const first = await service.create(createInput, ownerId);
    const replay = await service.create(createInput, ownerId);
    expect(first.id).toBe(replay.id);
    expect(shopExpense.create).toHaveBeenCalledTimes(1);
    expect(audits[0]).toMatchObject({ action: "SHOP_EXPENSE_CREATED", newData: { amount: "100.00", paymentChannel: "CASH" } });
    await expect(service.create({ ...createInput, amount: "200.00" }, ownerId)).rejects.toMatchObject({ code: "EXPENSE_IDEMPOTENCY_CONFLICT" });
  });

  it("preserves before/after audit values for corrections and excludes voided records", async () => {
    const { service, audits } = harness();
    const created = await service.create(createInput, ownerId);
    const corrected = await service.update(created.id, { name: "দোকান ভাড়া", amount: "125.00", paidOn: "2026-09-02", paymentChannel: "BANK", note: "সেপ্টেম্বর", reason: "ভুল তথ্য" }, ownerId);
    expect(corrected).toMatchObject({ name: "দোকান ভাড়া", amount: 125, paymentChannel: "BANK" });
    expect(audits[1]).toMatchObject({ action: "SHOP_EXPENSE_UPDATED", previousData: { amount: "100.00", paymentChannel: "CASH" }, newData: { amount: "125.00", paymentChannel: "BANK" }, reason: "ভুল তথ্য" });
    const voided = await service.void(created.id, "ডুপ্লিকেট রেকর্ড", ownerId);
    expect(voided.voidedAt).not.toBeNull();
    expect(audits[2]).toMatchObject({ action: "SHOP_EXPENSE_VOIDED", reason: "ডুপ্লিকেট রেকর্ড" });
    await expect(service.update(created.id, { name: "ভাড়া", amount: "1", paidOn: "2026-09-02", paymentChannel: "CASH", reason: "ভুল" }, ownerId)).rejects.toMatchObject({ code: "EXPENSE_VOIDED" });
    expect((await service.summary({})).total).toBe(0);
  });

  it("keeps decimal amounts exact in method summaries", async () => {
    const { service } = harness();
    await service.create({ ...createInput, amount: "0.10", paymentChannel: "BKASH" }, ownerId);
    const result = await service.summary({});
    expect(result.byMethod.find((row) => row.method === "BKASH")).toMatchObject({ amount: 0.1, count: 1 });
    expect(result.total).toBe(0.1);
  });
});
