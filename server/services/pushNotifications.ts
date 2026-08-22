import webPush, { type PushSubscription as WebPushSubscription } from "web-push";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type PushNotificationType } from "../generated/prisma/client.js";

const OPEN_CREDIT_STATUSES = ["UNPAID", "PARTIALLY_PAID"] as const;

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}

export interface PushSummary {
  sent: number;
  failed: number;
  expired: number;
  skipped: number;
}

export interface CreditReminderSummary extends PushSummary {
  actionableCount: number;
  totalOpenCount: number;
  date: string;
}

export interface PushNotificationService {
  readonly publicKey: string;
  register(profileId: string, input: PushSubscriptionInput): Promise<{ enabled: true }>;
  remove(profileId: string, endpoint: string): Promise<{ enabled: false }>;
  sendTest(profileId: string, endpoint: string): Promise<PushSummary>;
  notifyWebsiteOrder(order: { id: string; orderNumber: string }): Promise<PushSummary>;
  sendCreditReminders(now?: Date): Promise<CreditReminderSummary>;
}

export interface PushTransport {
  send(subscription: WebPushSubscription, payload: string): Promise<void>;
}

type NotificationPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

function isUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function deliveryStatus(error: unknown) {
  if (!error || typeof error !== "object") return undefined;
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === "number" ? status : undefined;
}

function dhakaDate(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function banglaNumber(value: number) {
  return value.toLocaleString("bn-BD", { useGrouping: false });
}

export function createPushNotificationService(
  prisma: PrismaClient,
  config: { publicKey: string; privateKey: string; subject: string },
  transport?: PushTransport,
): PushNotificationService {
  if (!transport) webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  const sender = transport ?? {
    async send(subscription, payload) {
      await webPush.sendNotification(subscription, payload, { TTL: 60 * 60 });
    },
  };

  async function deliver(
    subscription: { id: string; endpoint: string; p256dh: string; auth: string },
    type: PushNotificationType,
    dedupeKey: string,
    payload: NotificationPayload,
  ): Promise<PushSummary> {
    let delivery: { id: string };
    try {
      delivery = await prisma.pushDelivery.create({
        data: { subscriptionId: subscription.id, type, dedupeKey },
        select: { id: true },
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        const retryBefore = new Date(Date.now() - 60_000);
        const existing = await prisma.pushDelivery.findUnique({
          where: { dedupeKey },
          select: { id: true, status: true, attemptedAt: true },
        });
        if (!existing || existing.status !== "FAILED" || existing.attemptedAt > retryBefore) {
          return { sent: 0, failed: 0, expired: 0, skipped: 1 };
        }
        const claimed = await prisma.pushDelivery.updateMany({
          where: { id: existing.id, status: "FAILED", attemptedAt: { lte: retryBefore } },
          data: { status: "PENDING", attemptedAt: new Date(), failureCode: null },
        });
        if (claimed.count !== 1) return { sent: 0, failed: 0, expired: 0, skipped: 1 };
        delivery = { id: existing.id };
      } else {
        throw error;
      }
    }

    try {
      await sender.send({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, JSON.stringify(payload));
      await prisma.$transaction([
        prisma.pushDelivery.update({
          where: { id: delivery.id },
          data: { status: "SENT", sentAt: new Date(), failureCode: null },
        }),
        prisma.pushSubscription.update({
          where: { id: subscription.id },
          data: { lastSuccessfulAt: new Date() },
        }),
      ]);
      return { sent: 1, failed: 0, expired: 0, skipped: 0 };
    } catch (error) {
      const status = deliveryStatus(error);
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.delete({ where: { id: subscription.id } }).catch(() => undefined);
        return { sent: 0, failed: 0, expired: 1, skipped: 0 };
      }
      await prisma.pushDelivery.update({
        where: { id: delivery.id },
        data: { status: "FAILED", failureCode: status ? String(status) : "DELIVERY_FAILED" },
      });
      return { sent: 0, failed: 1, expired: 0, skipped: 0 };
    }
  }

  async function activeOwnerSubscriptions(profileId?: string) {
    return prisma.pushSubscription.findMany({
      where: {
        ...(profileId ? { profileId } : {}),
        profile: { role: "OWNER", isActive: true },
      },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
  }

  async function sendMany(
    subscriptions: Awaited<ReturnType<typeof activeOwnerSubscriptions>>,
    type: PushNotificationType,
    dedupePrefix: string,
    payload: NotificationPayload,
  ) {
    const results = await Promise.all(subscriptions.map(subscription =>
      deliver(subscription, type, `${dedupePrefix}:${subscription.id}`, payload),
    ));
    return results.reduce<PushSummary>((total, result) => ({
      sent: total.sent + result.sent,
      failed: total.failed + result.failed,
      expired: total.expired + result.expired,
      skipped: total.skipped + result.skipped,
    }), { sent: 0, failed: 0, expired: 0, skipped: 0 });
  }

  return {
    publicKey: config.publicKey,

    async register(profileId, input) {
      await prisma.pushSubscription.upsert({
        where: { endpoint: input.endpoint },
        create: {
          profileId,
          endpoint: input.endpoint,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userAgent: input.userAgent,
        },
        update: {
          profileId,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userAgent: input.userAgent,
        },
      });
      return { enabled: true };
    },

    async remove(profileId, endpoint) {
      await prisma.pushSubscription.deleteMany({ where: { profileId, endpoint } });
      return { enabled: false };
    },

    async sendTest(profileId, endpoint) {
      const subscription = (await activeOwnerSubscriptions(profileId)).find(item => item.endpoint === endpoint);
      if (!subscription) {
        throw Object.assign(new Error("Push subscription was not found for this device"), {
          status: 404,
          code: "PUSH_SUBSCRIPTION_NOT_FOUND",
        });
      }
      return deliver(subscription, "TEST", `test:${randomUUID()}:${subscription.id}`, {
        title: "নোটিফিকেশন চালু হয়েছে",
        body: "এই ডিভাইসে নাফাহ এগ্রোর গুরুত্বপূর্ণ নোটিফিকেশন আসবে।",
        url: "/profile",
        tag: "nafah-push-test",
      });
    },

    async notifyWebsiteOrder(order) {
      return sendMany(
        await activeOwnerSubscriptions(),
        "WEBSITE_ORDER",
        `website-order:${order.id}`,
        {
          title: "নতুন ওয়েবসাইট অর্ডার",
          body: "অর্ডারটি দেখে নিশ্চিত করুন।",
          url: `/admin/orders?orderNumber=${encodeURIComponent(order.orderNumber)}`,
          tag: `website-order-${order.id}`,
        },
      );
    },

    async sendCreditReminders(now = new Date()) {
      const date = dhakaDate(now);
      const dayStart = new Date(`${date}T00:00:00.000+06:00`);
      const creditWhere = {
        source: "PHYSICAL_SHOP" as const,
        paymentMethod: "CREDIT" as const,
        paymentStatus: { in: [...OPEN_CREDIT_STATUSES] },
      };
      const [totalOpenCount, actionableCount] = await Promise.all([
        prisma.salesOrder.count({ where: creditWhere }),
        prisma.salesOrder.count({ where: { ...creditWhere, nextFollowUpDate: { lte: dayStart } } }),
      ]);
      if (actionableCount === 0) {
        return { date, actionableCount, totalOpenCount, sent: 0, failed: 0, expired: 0, skipped: 0 };
      }
      const sent = await sendMany(
        await activeOwnerSubscriptions(),
        "CREDIT_REMINDER",
        `credit-reminder:${date}`,
        {
          title: "বাকি রিমাইন্ডার",
          body: `${banglaNumber(actionableCount)}টির যোগাযোগের সময় হয়েছে। মোট বাকি ${banglaNumber(totalOpenCount)}টি।`,
          url: "/admin/dues",
          tag: `credit-reminder-${date}`,
        },
      );
      return { date, actionableCount, totalOpenCount, ...sent };
    },
  };
}
