import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { cartLineSchema, cartLinesSchema, type CartService } from "../services/carts.js";

export function createCartRouter(service: CartService, authenticate: RequestHandler, limiter: RequestHandler) {
  const router = Router();
  const guarded = [limiter, authenticate];
  const parse = <S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> => {
    const result = schema.safeParse(body);
    if (!result.success) throw Object.assign(new Error("Request validation failed"), { status: 400, code: "VALIDATION_ERROR", details: { issues: result.error.issues } });
    return result.data;
  };
  router.post("/storefront/cart-preview", limiter, async (req, res, next) => {
    try { res.json({ success: true, data: await service.preview(parse(cartLinesSchema, req.body.items)) }); }
    catch (error) { next(error); }
  });
  router.get("/cart", ...guarded, async (req, res, next) => {
    try { res.json({ success: true, data: await service.read(req.authenticatedUser!.profile.id) }); }
    catch (error) { next(error); }
  });
  router.post("/cart/mutations", ...guarded, async (req, res, next) => {
    try {
      const input = parse(z.object({ revision: z.number().int().nonnegative(), action: z.enum(["ADD", "SET", "REMOVE", "CLEAR"]), line: cartLineSchema.optional() }).strict()
        .refine(value => value.action === "CLEAR" || Boolean(value.line), "An item is required"), req.body);
      res.json({ success: true, data: await service.mutate(req.authenticatedUser!.profile.id, input.revision, input.action, input.line) });
    } catch (error) { next(error); }
  });
  router.post("/cart/merge", ...guarded, async (req, res, next) => {
    try {
      const input = parse(z.object({ mergeKey: z.string().uuid(), items: cartLinesSchema }).strict(), req.body);
      res.json({ success: true, data: await service.merge(req.authenticatedUser!.profile.id, input.mergeKey, input.items) });
    } catch (error) { next(error); }
  });
  return router;
}
