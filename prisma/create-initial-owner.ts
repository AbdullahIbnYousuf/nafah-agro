import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../server/generated/prisma/client.js";
import { z } from "zod";

const argumentsSchema = z.object({
  userId: z.string().uuid("user ID must be a Supabase Auth UUID"),
  fullName: z.string().trim().min(1).max(120),
  phoneNumber: z.string().trim().min(7).max(30),
  confirmed: z.literal(true, {
    errorMap: () => ({
      message: "pass --confirm to acknowledge OWNER privilege creation",
    }),
  }),
});

function readFlag(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const input = argumentsSchema.parse({
  userId: readFlag("--user-id"),
  fullName: readFlag("--full-name"),
  phoneNumber: readFlag("--phone"),
  confirmed: process.argv.includes("--confirm") ? true : undefined,
});

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DIRECT_URL or DATABASE_URL is required");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

try {
  await prisma.$transaction(async (transaction) => {
    const existingProfile = await transaction.profile.findUnique({
      where: { id: input.userId },
      select: { role: true },
    });
    if (existingProfile) {
      throw new Error(
        `A ${existingProfile.role} profile already exists for this user; no privilege was changed`,
      );
    }

    await transaction.profile.create({
      data: {
        id: input.userId,
        role: "OWNER",
        fullName: input.fullName,
        phoneNumber: input.phoneNumber,
        isActive: true,
      },
    });
  });

  console.log(`Created active OWNER profile for Supabase user ${input.userId}`);
} finally {
  await prisma.$disconnect();
}
