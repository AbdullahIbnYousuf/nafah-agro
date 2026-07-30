import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../server/generated/prisma/client.js";

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DIRECT_URL or DATABASE_URL is required to seed PostgreSQL");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

try {
  await prisma.foundationRecord.upsert({
    where: { key: "milestone-1" },
    update: { value: "Nafah Agro PostgreSQL foundation is ready" },
    create: {
      key: "milestone-1",
      value: "Nafah Agro PostgreSQL foundation is ready",
    },
  });
} finally {
  await prisma.$disconnect();
}
