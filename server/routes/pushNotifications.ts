import { timingSafeEqual } from "node:crypto";
import { Router, type RequestHandler } from "express";
import { z, ZodError } from "zod";
import type { PushNotificationService } from "../services/pushNotifications.js";

const endpointSchema = z.string().url().max(2_048);
const subscriptionSchema = z.object({
  endpoint: endpointSchema,
  keys: z.object({
    p256dh: z.string().trim().min(16).max(512),
    auth: z.string().trim().min(8).max(256),
  }).strict(),
}).strict();
const endpointBodySchema = z.object({ endpoint: endpointSchema }).strict();

function validate<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      throw Object.assign(new Error("Request validation failed"), {
        status: 400,
        code: "VALIDATION_ERROR",
        details: { issues: error.issues },
      });
    }
    throw error;
  }
}

function validCronSecret(header: string | undefined, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header ?? "");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function createPushNotificationRouter(
  service: PushNotificationService,
  authenticate: RequestHandler,
  requireOwner: RequestHandler,
  protectedLimiter: RequestHandler,
  cronSecret: string,
) {
  const router = Router();
  const ownerRoute = [protectedLimiter, authenticate, requireOwner];

  router.get("/push/config", ...ownerRoute, (_req, res) => {
    res.json({ success: true, data: { publicKey: service.publicKey } });
  });

  router.post("/push/subscriptions", ...ownerRoute, async (req, res, next) => {
    try {
      const input = validate(subscriptionSchema, req.body);
      res.status(201).json({ success: true, data: await service.register(
        req.authenticatedUser!.profile.id,
        { ...input, userAgent: req.header("User-Agent")?.slice(0, 500) },
      ) });
    } catch (error) { next(error); }
  });

  router.delete("/push/subscriptions", ...ownerRoute, async (req, res, next) => {
    try {
      const input = validate(endpointBodySchema, req.body);
      res.json({ success: true, data: await service.remove(req.authenticatedUser!.profile.id, input.endpoint) });
    } catch (error) { next(error); }
  });

  router.post("/push/test", ...ownerRoute, async (req, res, next) => {
    try {
      const input = validate(endpointBodySchema, req.body);
      res.json({ success: true, data: await service.sendTest(req.authenticatedUser!.profile.id, input.endpoint) });
    } catch (error) { next(error); }
  });

  router.get("/cron/credit-reminders", async (req, res, next) => {
    if (!validCronSecret(req.header("Authorization"), cronSecret)) {
      res.status(401).json({
        success: false,
        error: { code: "CRON_UNAUTHORIZED", message: "Cron authorization failed.", details: {} },
      });
      return;
    }
    try {
      res.json({ success: true, data: await service.sendCreditReminders() });
    } catch (error) { next(error); }
  });

  return router;
}
