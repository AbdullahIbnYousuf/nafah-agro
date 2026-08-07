import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../server/generated/prisma/client.js";

const CONFIRMATION = "REFRESH_NAFAH_DASHBOARD_DEMO";
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (process.env.CONFIRM_DASHBOARD_DEMO !== CONFIRMATION) {
  throw new Error(
    `This command changes dates on three known demo orders. Set CONFIRM_DASHBOARD_DEMO=${CONFIRMATION} to continue.`,
  );
}

if (!connectionString) {
  throw new Error("DIRECT_URL or DATABASE_URL is required");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1_000;

function dhakaTime(daysAgo: number, hour: number, minute: number) {
  const nowInDhaka = new Date(Date.now() + DHAKA_OFFSET_MS);
  return new Date(Date.UTC(
    nowInDhaka.getUTCFullYear(),
    nowInDhaka.getUTCMonth(),
    nowInDhaka.getUTCDate() - daysAgo,
    hour - 6,
    minute,
  ));
}

const targets = [
  {
    orderNumber: "PHY-DEMO-1001",
    source: "PHYSICAL_SHOP" as const,
    status: "COMPLETED" as const,
    placedAt: dhakaTime(0, 11, 15),
    recognizedAt: dhakaTime(0, 11, 15),
  },
  {
    orderNumber: "PHY-DEMO-1002",
    source: "PHYSICAL_SHOP" as const,
    status: "COMPLETED" as const,
    placedAt: dhakaTime(1, 15, 30),
    recognizedAt: dhakaTime(1, 15, 30),
  },
  {
    orderNumber: "WEB-DEMO-1003",
    source: "WEBSITE" as const,
    status: "DELIVERED" as const,
    placedAt: dhakaTime(2, 10, 0),
    confirmedAt: dhakaTime(2, 12, 0),
    recognizedAt: dhakaTime(2, 18, 0),
  },
] as const;

try {
  const refreshed = await prisma.$transaction(async (transaction) => {
    const orders = await transaction.salesOrder.findMany({
      where: { orderNumber: { in: targets.map((target) => target.orderNumber) } },
      select: {
        id: true,
        orderNumber: true,
        source: true,
        status: true,
        items: { select: { id: true } },
      },
    });

    if (orders.length !== targets.length) {
      const found = new Set(orders.map((order) => order.orderNumber));
      const missing = targets
        .filter((target) => !found.has(target.orderNumber))
        .map((target) => target.orderNumber);
      throw new Error(
        `Dashboard demo refresh requires the existing demo dataset. Missing: ${missing.join(", ")}`,
      );
    }

    for (const target of targets) {
      const order = orders.find((candidate) => candidate.orderNumber === target.orderNumber)!;
      if (order.source !== target.source || order.status !== target.status) {
        throw new Error(
          `${target.orderNumber} no longer has its expected demo source/status; no dates were changed`,
        );
      }

      await transaction.salesOrder.update({
        where: { id: order.id },
        data: target.status === "COMPLETED"
          ? { placedAt: target.placedAt, completedAt: target.recognizedAt }
          : {
              placedAt: target.placedAt,
              confirmedAt: target.confirmedAt,
              deliveredAt: target.recognizedAt,
            },
      });

      await transaction.orderAllocation.updateMany({
        where: { salesOrderItemId: { in: order.items.map((item) => item.id) } },
        data: target.source === "PHYSICAL_SHOP"
          ? { consumedAt: target.recognizedAt }
          : { reservedAt: target.confirmedAt, consumedAt: target.recognizedAt },
      });
    }

    return targets.map((target) => ({
      orderNumber: target.orderNumber,
      recognizedAt: target.recognizedAt.toISOString(),
    }));
  });

  console.log(JSON.stringify({ refreshed, deleted: 0, created: 0 }, null, 2));
} finally {
  await prisma.$disconnect();
}
