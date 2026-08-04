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
      res.status(result.replayed ? 200 : 201).json({ success: true, data: result });
    } catch (error) { next(error); }
  });

  router.get("/orders/my", protectedLimiter, authenticate, async (req, res, next) => {
    try {
      res.json({ success: true, data: await service.listCustomerWebsiteOrders(req.authenticatedUser!.profile.id) });
    } catch (error) { next(error); }
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
