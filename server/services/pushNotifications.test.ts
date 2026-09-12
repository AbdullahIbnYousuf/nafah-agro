// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/client.js";
import { createPushNotificationService } from "./pushNotifications.js";

function setup(counts: number[] = [5, 3]) {
  const subscription = {
    id: "subscription-1",
    endpoint: "https://push.example/subscription-1",
    p256dh: "p256dh-key-value",
    auth: "auth-key-value",
  };
  const prisma = {
    pushSubscription: {
      findMany: vi.fn(async () => [subscription]),
      upsert: vi.fn(async () => subscription),
      deleteMany: vi.fn(async () => ({ count: 1 })),
      delete: vi.fn(async () => subscription),
      update: vi.fn(async () => subscription),
    },
    pushDelivery: {
      create: vi.fn(async () => ({ id: "delivery-1" })),
      findUnique: vi.fn(async () => null),
      update: vi.fn(async () => ({ id: "delivery-1" })),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    creditCustomer: { count: vi.fn().mockImplementation(async () => counts.shift() ?? 0) },
    $transaction: vi.fn(async (operations: unknown[]) => Promise.all(operations)),
  } as unknown as PrismaClient;
  const transport = { send: vi.fn(async () => undefined) };
  const service = createPushNotificationService(prisma, {
    publicKey: "public-key",
    privateKey: "private-key",
    subject: "mailto:test@example.com",
  }, transport);
  return { service, prisma, transport, subscription };
}

describe("push notification service", () => {
  it("registers a device against the authenticated profile", async () => {
    const { service, prisma } = setup();
    await service.register("profile-1", {
      endpoint: "https://push.example/device",
      keys: { p256dh: "p256dh-key-value", auth: "auth-key-value" },
      userAgent: "Chrome",
    });

    expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { endpoint: "https://push.example/device" },
      create: expect.objectContaining({ profileId: "profile-1", userAgent: "Chrome" }),
    }));
  });

  it("sends the actionable and total credit counts to active OWNER devices", async () => {
    const { service, prisma, transport } = setup([5, 3]);
    const result = await service.sendCreditReminders(new Date("2026-08-22T03:00:00.000Z"));

    expect(result).toMatchObject({ date: "2026-08-22", totalOpenCount: 5, actionableCount: 3, sent: 1 });
    expect(prisma.pushSubscription.findMany).toHaveBeenCalledWith({
      where: { profile: { role: "OWNER", isActive: true } },
      select: expect.any(Object),
    });
    const payload = JSON.parse(transport.send.mock.calls[0][1]);
    expect(payload).toMatchObject({
      title: "বাকি রিমাইন্ডার",
      body: "৩টির যোগাযোগের সময় হয়েছে। মোট বাকি ৫টি।",
      url: "/admin/dues",
    });
  });

  it("does not notify when no follow-up is due", async () => {
    const { service, prisma, transport } = setup([5, 0]);
    const result = await service.sendCreditReminders(new Date("2026-08-22T03:00:00.000Z"));

    expect(result).toMatchObject({ totalOpenCount: 5, actionableCount: 0, sent: 0 });
    expect(prisma.pushSubscription.findMany).not.toHaveBeenCalled();
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("removes an expired browser subscription without exposing its endpoint", async () => {
    const { service, prisma, transport } = setup();
    transport.send.mockRejectedValueOnce({ statusCode: 410 });
    const result = await service.notifyWebsiteOrder({ id: "order-1", orderNumber: "WEB-1001" });

    expect(result.expired).toBe(1);
    expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: "subscription-1" } });
  });
});
