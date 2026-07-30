import type { PrismaClient } from "../generated/prisma/client.js";

export interface FoundationRecord {
  key: string;
  value: string;
  updatedAt: Date;
}

export type FoundationRecordReader = () => Promise<FoundationRecord | null>;
export type DatabaseHealthCheck = () => Promise<void>;

export function createFoundationRecordReader(
  prisma: PrismaClient,
): FoundationRecordReader {
  return () =>
    prisma.foundationRecord.findUnique({
      where: { key: "milestone-1" },
      select: { key: true, value: true, updatedAt: true },
    });
}

export function createDatabaseHealthCheck(
  prisma: PrismaClient,
): DatabaseHealthCheck {
  return async () => {
    await prisma.$queryRaw`SELECT 1`;
  };
}
