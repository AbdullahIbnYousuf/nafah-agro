import { Router, type RequestHandler } from "express";
import { z, ZodError } from "zod";
import { analyticsDashboardQuerySchema } from "../schemas/analytics.js";
import type { AnalyticsService } from "../services/analytics.js";

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

export function createAnalyticsRouter(
  service: AnalyticsService,
  authenticate: RequestHandler,
  requireOwner: RequestHandler,
  protectedLimiter: RequestHandler,
) {
  const router = Router();

  router.get(
    "/analytics/dashboard",
    protectedLimiter,
    authenticate,
    requireOwner,
    async (req, res, next) => {
      try {
        res.json({
          success: true,
          data: await service.getDashboard(validate(analyticsDashboardQuerySchema, req.query)),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
