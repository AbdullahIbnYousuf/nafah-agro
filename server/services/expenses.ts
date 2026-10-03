import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import type { z } from "zod";
import type { expenseCreateSchema, expenseListSchema, expenseSummarySchema, expenseUpdateSchema } from "../schemas/expenses.js";

type CreateInput = z.output<typeof expenseCreateSchema>;
type UpdateInput = z.output<typeof expenseUpdateSchema>;
type ListInput = z.output<typeof expenseListSchema>;
type RangeInput = z.output<typeof expenseSummarySchema>;
const methods = ["CASH", "BKASH", "NAGAD", "ROCKET", "BANK"] as const;
const include = { createdBy: { select: { fullName: true } }, voidedBy: { select: { fullName: true } } } as const;
type ExpenseRecord = Prisma.ShopExpenseGetPayload<{ include: typeof include }>;

function problem(status: number, code: string, message: string) {
  return Object.assign(new Error(message), { status, code });
}
function asDate(value: string) { return new Date(`${value}T00:00:00.000Z`); }
function snapshot(value: { name: string; amount: Prisma.Decimal; paidOn: Date; paymentChannel: string; note: string | null }) {
  return { name: value.name, amount: value.amount.toFixed(2), paidOn: value.paidOn.toISOString().slice(0, 10), paymentChannel: value.paymentChannel, note: value.note };
}
function dto(value: ExpenseRecord) {
  return {
    id: value.id, name: value.name, amount: Number(value.amount),
    paidOn: value.paidOn.toISOString().slice(0, 10), paymentChannel: value.paymentChannel,
    note: value.note, createdAt: value.createdAt.toISOString(), updatedAt: value.updatedAt.toISOString(),
    createdBy: value.createdBy.fullName, voidedAt: value.voidedAt?.toISOString() ?? null,
    voidReason: value.voidReason, voidedBy: value.voidedBy?.fullName ?? null,
  };
}
function dateWhere(input: RangeInput): Prisma.ShopExpenseWhereInput {
  if (!input.from && !input.to) return {};
  return { paidOn: { ...(input.from ? { gte: asDate(input.from) } : {}), ...(input.to ? { lte: asDate(input.to) } : {}) } };
}

export function createExpenseService(prisma: PrismaClient) {
  async function detail(id: string) {
    const [expense, history] = await Promise.all([
      prisma.shopExpense.findUnique({ where: { id }, include }),
      prisma.auditLog.findMany({ where: { entityType: "SHOP_EXPENSE", entityId: id }, include: { actor: { select: { fullName: true } } }, orderBy: { createdAt: "desc" } }),
    ]);
    if (!expense) throw problem(404, "EXPENSE_NOT_FOUND", "Expense not found.");
    return { ...dto(expense), history: history.map((entry) => ({
      id: entry.id, action: entry.action, reason: entry.reason,
      previousData: entry.previousData, newData: entry.newData,
      actor: entry.actor?.fullName ?? "ওনার", createdAt: entry.createdAt.toISOString(),
    })) };
  }
  async function replay(key: string, fingerprint: string) {
    const existing = await prisma.shopExpense.findUnique({ where: { idempotencyKey: key }, include });
    if (!existing) return null;
    if (existing.requestFingerprint !== fingerprint) throw problem(409, "EXPENSE_IDEMPOTENCY_CONFLICT", "This request key was already used for another expense.");
    return dto(existing);
  }
  return {
    detail,
    async list(input: ListInput) {
      const where: Prisma.ShopExpenseWhereInput = {
        ...dateWhere(input),
        ...(input.status === "ACTIVE" ? { voidedAt: null } : input.status === "VOIDED" ? { voidedAt: { not: null } } : {}),
        ...(input.q ? { name: { contains: input.q, mode: "insensitive" } } : {}),
        ...(input.paymentChannel ? { paymentChannel: input.paymentChannel } : {}),
      };
      const [records, total] = await Promise.all([
        prisma.shopExpense.findMany({ where, include, orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }], skip: (input.page - 1) * input.limit, take: input.limit }),
        prisma.shopExpense.count({ where }),
      ]);
      return { data: records.map(dto), total, page: input.page, limit: input.limit, totalPages: Math.ceil(total / input.limit) };
    },
    async summary(input: RangeInput) {
      const groups = await prisma.shopExpense.groupBy({
        by: ["paymentChannel"], where: { ...dateWhere(input), voidedAt: null },
        _sum: { amount: true }, _count: { _all: true },
      });
      const byMethod = methods.map((method) => {
        const group = groups.find((value) => value.paymentChannel === method);
        return { method, amount: Number(group?._sum.amount ?? 0), count: group?._count._all ?? 0 };
      });
      const total = groups.reduce((sum, group) => sum.plus(group._sum.amount ?? 0), new Prisma.Decimal(0));
      return { total: Number(total), count: byMethod.reduce((sum, item) => sum + item.count, 0), byMethod };
    },
    async suggestions(q: string) {
      const records = await prisma.shopExpense.findMany({ where: { voidedAt: null, ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) }, distinct: ["name"], select: { name: true }, orderBy: { name: "asc" }, take: 10 });
      return records.map((record) => record.name);
    },
    async create(input: CreateInput, actorId: string) {
      const normalized = { name: input.name, amount: new Prisma.Decimal(input.amount), paidOn: asDate(input.paidOn), paymentChannel: input.paymentChannel, note: input.note || null };
      const fingerprint = createHash("sha256").update(JSON.stringify({ actorId, ...snapshot(normalized) })).digest("hex");
      const previous = await replay(input.idempotencyKey, fingerprint);
      if (previous) return previous;
      try {
        const id = await prisma.$transaction(async (tx) => {
          const expense = await tx.shopExpense.create({ data: { ...normalized, idempotencyKey: input.idempotencyKey, requestFingerprint: fingerprint, createdByProfileId: actorId } });
          await tx.auditLog.create({ data: { actorProfileId: actorId, action: "SHOP_EXPENSE_CREATED", entityType: "SHOP_EXPENSE", entityId: expense.id, newData: snapshot(expense) } });
          return expense.id;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
        return dto((await prisma.shopExpense.findUniqueOrThrow({ where: { id }, include })));
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const duplicate = await replay(input.idempotencyKey, fingerprint);
          if (duplicate) return duplicate;
        }
        throw error;
      }
    },
    async update(id: string, input: UpdateInput, actorId: string) {
      await prisma.$transaction(async (tx) => {
        const current = await tx.shopExpense.findUnique({ where: { id } });
        if (!current) throw problem(404, "EXPENSE_NOT_FOUND", "Expense not found.");
        if (current.voidedAt) throw problem(409, "EXPENSE_VOIDED", "A voided expense cannot be changed.");
        const before = snapshot(current);
        const data = { name: input.name, amount: new Prisma.Decimal(input.amount), paidOn: asDate(input.paidOn), paymentChannel: input.paymentChannel, note: input.note || null };
        const after = snapshot(data);
        if (JSON.stringify(before) === JSON.stringify(after)) throw problem(409, "EXPENSE_UNCHANGED", "No expense information changed.");
        await tx.shopExpense.update({ where: { id }, data });
        await tx.auditLog.create({ data: { actorProfileId: actorId, action: "SHOP_EXPENSE_UPDATED", entityType: "SHOP_EXPENSE", entityId: id, previousData: before, newData: after, reason: input.reason } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
      return detail(id);
    },
    async void(id: string, reason: string, actorId: string) {
      await prisma.$transaction(async (tx) => {
        const current = await tx.shopExpense.findUnique({ where: { id } });
        if (!current) throw problem(404, "EXPENSE_NOT_FOUND", "Expense not found.");
        if (current.voidedAt) throw problem(409, "EXPENSE_VOIDED", "This expense is already voided.");
        const voidedAt = new Date();
        await tx.shopExpense.update({ where: { id }, data: { voidedAt, voidReason: reason, voidedByProfileId: actorId } });
        await tx.auditLog.create({ data: { actorProfileId: actorId, action: "SHOP_EXPENSE_VOIDED", entityType: "SHOP_EXPENSE", entityId: id, previousData: snapshot(current), newData: { ...snapshot(current), voidedAt: voidedAt.toISOString() }, reason } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
      return detail(id);
    },
  };
}
export type ExpenseService = ReturnType<typeof createExpenseService>;
