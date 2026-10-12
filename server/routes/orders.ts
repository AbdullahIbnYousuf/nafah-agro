import { Router, type RequestHandler } from "express";
import { z, ZodError } from "zod";
import {
  deliveryRateUpdateSchema,
  manualDeliveryOrderSchema,
  orderLifecycleSchema,
  orderListSchema,
  websiteCheckoutSchema,
} from "../schemas/orders.js";
import type { UnifiedOrderService } from "../services/orders.js";
import type { BackgroundTaskScheduler } from "../lib/backgroundTasks.js";

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

export function createOrderRouter(
  service: UnifiedOrderService,
  optionalAuthenticate: RequestHandler,
  authenticate: RequestHandler,
  requireOwner: RequestHandler,
  protectedLimiter: RequestHandler,
  onWebsiteOrderCreated?: (order: { id: string; orderNumber: string }) => Promise<unknown>,
  scheduleBackground?: BackgroundTaskScheduler,
) {
  const router = Router();
  const management = [protectedLimiter, authenticate, requireOwner];

  router.get("/delivery-rates", async (_req, res, next) => {
    try { res.json({ success: true, data: await service.listDeliveryRates(false) }); }
    catch (error) { next(error); }
  });

  router.get("/admin/delivery-rates", ...management, async (_req, res, next) => {
    try { res.json({ success: true, data: await service.listDeliveryRates(true) }); }
    catch (error) { next(error); }
  });

  router.patch("/delivery-rates/:id", ...management, async (req, res, next) => {
    try {
      res.json({ success: true, data: await service.updateDeliveryRate(
        req.params.id,
        validate(deliveryRateUpdateSchema, req.body),
        req.authenticatedUser!.profile.id,
      ) });
    } catch (error) { next(error); }
  });

  router.post("/orders/website", protectedLimiter, optionalAuthenticate, async (req, res, next) => {
    try {
      const result = await service.createWebsiteOrder(
        validate(websiteCheckoutSchema, req.body),
        req.authenticatedUser?.profile.id,
      );
      if (!result.replayed && onWebsiteOrderCreated) {
        const notification = onWebsiteOrderCreated(result.order);
        if (scheduleBackground) scheduleBackground(notification);
        else void notification.catch(() => undefined);
      }
      res.status(result.replayed ? 200 : 201).json({ success: true, data: result });
    } catch (error) { next(error); }
  });

  router.get("/orders/my", protectedLimiter, authenticate, async (req, res, next) => {
    try {
      if (req.query.page === undefined && req.query.limit === undefined) {
        res.json({ success: true, data: await service.listCustomerWebsiteOrders(req.authenticatedUser!.profile.id) });
      } else {
        const input = validate(z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(15) }).strict(), req.query);
        res.json({ success: true, data: await service.listPersonalOrders(req.authenticatedUser!.profile.id, input.page, input.limit) });
      }
    } catch (error) { next(error); }
  });

  router.get("/orders/my/:id", protectedLimiter, authenticate, async (req, res, next) => {
    try { res.json({ success: true, data: await service.readPersonalOrder(req.authenticatedUser!.profile.id, validate(z.string().uuid(), req.params.id)) }); }
    catch (error) { next(error); }
  });

  router.post("/orders/manual", ...management, async (req, res, next) => {
    try {
      res.status(201).json({ success: true, data: await service.createManualOrder(
        validate(manualDeliveryOrderSchema, req.body),
        req.authenticatedUser!.profile.id,
      ) });
    } catch (error) { next(error); }
  });

  router.get("/orders", ...management, async (req, res, next) => {
    try { res.json({ success: true, data: await service.listOrders(validate(orderListSchema, req.query)) }); }
    catch (error) { next(error); }
  });

  router.patch("/orders/:id/status", ...management, async (req, res, next) => {
    try {
      res.json({ success: true, data: await service.transitionOrder(
        req.params.id,
        validate(orderLifecycleSchema, req.body),
        req.authenticatedUser!.profile.id,
      ) });
    } catch (error) { next(error); }
  });

  return router;
}
