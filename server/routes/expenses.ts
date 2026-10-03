import { Router, type RequestHandler } from "express";
import { z, ZodError } from "zod";
import { expenseCreateSchema, expenseListSchema, expenseSummarySchema, expenseSuggestionsSchema, expenseUpdateSchema, expenseVoidSchema } from "../schemas/expenses.js";
import type { ExpenseService } from "../services/expenses.js";

function validate<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  try { return schema.parse(value); }
  catch (error) {
    if (error instanceof ZodError) throw Object.assign(new Error("Request validation failed"), { status: 400, code: "VALIDATION_ERROR", details: { issues: error.issues } });
    throw error;
  }
}

export function createExpenseRouter(service: ExpenseService, authenticate: RequestHandler, requireOwner: RequestHandler, limiter: RequestHandler) {
  const router = Router();
  router.use("/expenses", limiter, authenticate, requireOwner);
  router.get("/expenses/summary", async (req, res, next) => { try { res.json({ success: true, data: await service.summary(validate(expenseSummarySchema, req.query)) }); } catch (error) { next(error); } });
  router.get("/expenses/names", async (req, res, next) => { try { res.json({ success: true, data: await service.suggestions(validate(expenseSuggestionsSchema, req.query).q) }); } catch (error) { next(error); } });
  router.get("/expenses", async (req, res, next) => { try { res.json({ success: true, data: await service.list(validate(expenseListSchema, req.query)) }); } catch (error) { next(error); } });
  router.post("/expenses", async (req, res, next) => { try { res.status(201).json({ success: true, data: await service.create(validate(expenseCreateSchema, req.body), req.authenticatedUser!.profile.id) }); } catch (error) { next(error); } });
  router.get("/expenses/:id", async (req, res, next) => { try { res.json({ success: true, data: await service.detail(validate(z.string().uuid(), req.params.id)) }); } catch (error) { next(error); } });
  router.patch("/expenses/:id", async (req, res, next) => { try { res.json({ success: true, data: await service.update(validate(z.string().uuid(), req.params.id), validate(expenseUpdateSchema, req.body), req.authenticatedUser!.profile.id) }); } catch (error) { next(error); } });
  router.post("/expenses/:id/void", async (req, res, next) => { try { res.json({ success: true, data: await service.void(validate(z.string().uuid(), req.params.id), validate(expenseVoidSchema, req.body).reason, req.authenticatedUser!.profile.id) }); } catch (error) { next(error); } });
  return router;
}
