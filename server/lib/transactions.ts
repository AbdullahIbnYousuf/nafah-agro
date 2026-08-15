import { Prisma } from "../generated/prisma/client.js";

// Supabase connections from a cold Vercel function can need longer than
// Prisma's five-second interactive-transaction default. Keep one shared limit
// for all FIFO-sensitive writes so inventory and order flows behave alike.
export const SERIALIZABLE_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 20_000,
} as const;

export function isTransactionTimeout(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "P2028");
}
