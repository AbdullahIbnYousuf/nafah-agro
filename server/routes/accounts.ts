import { Router, type RequestHandler } from "express";
import { z, ZodError } from "zod";
import type { AccountService } from "../services/accounts.js";

const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  phoneNumber: z.string().trim().min(7).max(30),
}).strict();

const ownerInviteSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  phoneNumber: z.string().trim().min(7).max(30),
  email: z.string().trim().email().max(254),
}).strict();

const ownerStatusSchema = z.object({
  isActive: z.boolean(),
  reason: z.string().trim().min(3).max(500),
}).strict();

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

export function createAccountRouter(
  service: AccountService,
  authenticate: RequestHandler,
  requireOwner: RequestHandler,
  protectedLimiter: RequestHandler,
  ownerInviteLimiter: RequestHandler,
) {
  const router = Router();
  const ownerRoute = [protectedLimiter, authenticate, requireOwner];

  router.patch("/auth/me", protectedLimiter, authenticate, async (req, res, next) => {
    try {
      const profile = await service.updateOwnProfile(
        req.authenticatedUser!.profile.id,
        validate(profileUpdateSchema, req.body),
      );
      res.json({
        success: true,
        data: {
          id: profile.id,
          name: profile.fullName,
          email: req.authenticatedUser!.authUser.email ?? null,
          phoneNumber: profile.phoneNumber,
          role: profile.role,
          isActive: profile.isActive,
        },
      });
    } catch (error) { next(error); }
  });

  router.get("/owners", ...ownerRoute, async (_req, res, next) => {
    try { res.json({ success: true, data: {
      owners: await service.listOwners(),
      invitationsConfigured: service.ownerInvitationsConfigured,
    } }); }
    catch (error) { next(error); }
  });

  router.post("/owners/invitations", ownerInviteLimiter, ...ownerRoute, async (req, res, next) => {
    try {
      const owner = await service.inviteOwner(
        req.authenticatedUser!.profile.id,
        validate(ownerInviteSchema, req.body),
      );
      res.status(201).json({ success: true, data: owner });
    } catch (error) { next(error); }
  });

  router.patch("/owners/:id/status", ...ownerRoute, async (req, res, next) => {
    try {
      const owner = await service.setOwnerActive(
        req.authenticatedUser!.profile.id,
        req.params.id,
        validate(ownerStatusSchema, req.body),
      );
      res.json({ success: true, data: owner });
    } catch (error) { next(error); }
  });

  return router;
}
