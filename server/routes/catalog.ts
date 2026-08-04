import { Router, type RequestHandler } from "express";
import { z, ZodError } from "zod";
import {
  bulkPriceChangeSchema, categoryCreateSchema, categoryUpdateSchema, priceChangeSchema,
  productCreateSchema, productListSchema, productUpdateSchema, variantCreateSchema,
  variantUpdateSchema,
} from "../schemas/catalog.js";
import type { CatalogService } from "../services/catalog.js";

function validate<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  try { return schema.parse(value); }
  catch (error) {
    if (error instanceof ZodError) throw Object.assign(new Error("Request validation failed"), {
      status: 400,
      code: "VALIDATION_ERROR",
      details: { issues: error.issues },
    });
    throw error;
  }
}

export function createCatalogRouter(
  service: CatalogService,
  authenticate: RequestHandler,
  requireOwner: RequestHandler,
  protectedLimiter: RequestHandler,
) {
  const router = Router();
  const protectedRoute = [protectedLimiter, authenticate, requireOwner];

  router.get("/categories", async (_req, res, next) => {
    try { res.json({ success: true, data: await service.listCategories() }); } catch (error) { next(error); }
  });
  router.get("/admin/categories", ...protectedRoute, async (_req, res, next) => {
    try { res.json({ success: true, data: await service.listCategories(true) }); } catch (error) { next(error); }
  });
  router.post("/categories", ...protectedRoute, async (req, res, next) => {
    try { res.status(201).json({ success: true, data: await service.createCategory(validate(categoryCreateSchema, req.body)) }); } catch (error) { next(error); }
  });
  router.patch("/categories/:id", ...protectedRoute, async (req, res, next) => {
    try { res.json({ success: true, data: await service.updateCategory(req.params.id, validate(categoryUpdateSchema, req.body)) }); } catch (error) { next(error); }
  });
  router.get("/products", async (req, res, next) => {
    try { res.json({ success: true, data: await service.listProducts(validate(productListSchema, req.query)) }); } catch (error) { next(error); }
  });
  router.get("/admin/products", ...protectedRoute, async (req, res, next) => {
    try { res.json({ success: true, data: await service.listProducts(validate(productListSchema, req.query), true) }); } catch (error) { next(error); }
  });
  router.get("/products/:slug", async (req, res, next) => {
    try { res.json({ success: true, data: await service.getProductBySlug(req.params.slug) }); } catch (error) { next(error); }
  });
  router.post("/products", ...protectedRoute, async (req, res, next) => {
    try { res.status(201).json({ success: true, data: await service.createProduct(validate(productCreateSchema, req.body), req.authenticatedUser!.profile.id) }); } catch (error) { next(error); }
  });
  router.patch("/products/:id", ...protectedRoute, async (req, res, next) => {
    try { res.json({ success: true, data: await service.updateProduct(req.params.id, validate(productUpdateSchema, req.body)) }); } catch (error) { next(error); }
  });
  router.post("/products/:id/variants", ...protectedRoute, async (req, res, next) => {
    try { res.status(201).json({ success: true, data: await service.createVariant(req.params.id, validate(variantCreateSchema, req.body), req.authenticatedUser!.profile.id) }); } catch (error) { next(error); }
  });
  router.patch("/variants/:id", ...protectedRoute, async (req, res, next) => {
    try { res.json({ success: true, data: await service.updateVariant(req.params.id, validate(variantUpdateSchema, req.body)) }); } catch (error) { next(error); }
  });
  router.patch("/variants/:id/selling-price", ...protectedRoute, async (req, res, next) => {
    try { res.json({ success: true, data: await service.changePrice(req.params.id, validate(priceChangeSchema, req.body), req.authenticatedUser!.profile.id) }); } catch (error) { next(error); }
  });
  router.get("/variants/:id/price-history", ...protectedRoute, async (req, res, next) => {
    try { res.json({ success: true, data: await service.getPriceHistory(req.params.id) }); } catch (error) { next(error); }
  });
  router.post("/variants/selling-prices/bulk", ...protectedRoute, async (req, res, next) => {
    try { res.json({ success: true, data: await service.bulkChangePrices(validate(bulkPriceChangeSchema, req.body), req.authenticatedUser!.profile.id) }); } catch (error) { next(error); }
  });
  return router;
}
