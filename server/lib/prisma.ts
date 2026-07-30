import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const globalForPrisma = globalThis as unknown as {
  nafahPrisma?: PrismaClient;
  nafahPrismaUrl?: string;
};

export function getPrismaClient(connectionString: string): PrismaClient {
  if (
    !globalForPrisma.nafahPrisma ||
    globalForPrisma.nafahPrismaUrl !== connectionString
  ) {
    const adapter = new PrismaPg({ connectionString });
    globalForPrisma.nafahPrisma = new PrismaClient({ adapter });
    globalForPrisma.nafahPrismaUrl = connectionString;
  }

  return globalForPrisma.nafahPrisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (globalForPrisma.nafahPrisma) {
    await globalForPrisma.nafahPrisma.$disconnect();
    globalForPrisma.nafahPrisma = undefined;
    globalForPrisma.nafahPrismaUrl = undefined;
  }
}
