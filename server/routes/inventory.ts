import { Router, type RequestHandler } from "express";
import { z, ZodError } from "zod";
import {
  physicalSaleCreateSchema,
  physicalSaleListSchema,
  purchaseCreateSchema,
  stockAdjustmentSchema,
  stockBatchListSchema,
} from "../schemas/inventory.js";
import type { InventoryService } from "../services/inventory.js";

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

export function createInventoryRouter(
  service: InventoryService,
  authenticate: RequestHandler,
  requireAdminOrOwner: RequestHandler,
  protectedLimiter: RequestHandler,
) {
  const router = Router();
  const protectedRoute = [protectedLimiter, authenticate, requireAdminOrOwner];

  router.get("/stock-batches", ...protectedRoute, async (req, res, next) => {
    try {
      res.json({ success: true, data: await service.listBatches(validate(stockBatchListSchema, req.query)) });
    } catch (error) { next(error); }
  });

  router.post("/purchases", ...protectedRoute, async (req, res, next) => {
    try {
      res.status(201).json({
        success: true,
        data: await service.createPurchase(
          validate(purchaseCreateSchema, req.body),
          req.authenticatedUser!.profile.id,
        ),
      });
    } catch (error) { next(error); }
  });

  router.post("/stock-adjustments", ...protectedRoute, async (req, res, next) => {
    try {
      res.status(201).json({
        success: true,
        data: await service.adjustStock(
          validate(stockAdjustmentSchema, req.body),
          req.authenticatedUser!.profile.id,
        ),
      });
    } catch (error) { next(error); }
  });

  router.post("/physical-sales", ...protectedRoute, async (req, res, next) => {
    try {
      res.status(201).json({
        success: true,
        data: await service.createPhysicalSale(
          validate(physicalSaleCreateSchema, req.body),
          req.authenticatedUser!.profile.id,
        ),
      });
    } catch (error) { next(error); }
  });

  router.get("/physical-sales", ...protectedRoute, async (req, res, next) => {
    try {
      res.json({
        success: true,
        data: await service.listPhysicalSales(validate(physicalSaleListSchema, req.query)),
      });
    } catch (error) { next(error); }
  });

  return router;
}
