import type { NextFunction, Request, RequestHandler, Response } from "express";
import type {
  SupabaseTokenVerifier,
  VerifiedSupabaseUser,
} from "../lib/supabaseAuth.js";
import type {
  ApplicationProfile,
  ProfileReader,
} from "../services/profiles.js";

export interface AuthenticatedPrincipal {
  authUser: VerifiedSupabaseUser;
  profile: ApplicationProfile;
}

declare module "express-serve-static-core" {
  interface Request {
    authenticatedUser?: AuthenticatedPrincipal;
    verifiedSupabaseUser?: VerifiedSupabaseUser;
  }
}

function sendAuthorizationError(
  res: Response,
  status: number,
  code: string,
  message: string,
) {
  res.status(status).json({
    success: false,
    error: { code, message, details: {} },
  });
}

export function requireSupabaseUser(
  verifyToken: SupabaseTokenVerifier,
): RequestHandler {
  return async (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      sendAuthorizationError(res, 401, "AUTHENTICATION_REQUIRED", "A valid Supabase access token is required.");
      return;
    }
    const token = authorization.slice("Bearer ".length).trim();
    if (!token) {
      sendAuthorizationError(res, 401, "AUTHENTICATION_REQUIRED", "A valid Supabase access token is required.");
      return;
    }
    try {
      req.verifiedSupabaseUser = await verifyToken(token);
      next();
    } catch {
      sendAuthorizationError(res, 401, "INVALID_ACCESS_TOKEN", "The Supabase access token is invalid or expired.");
    }
  };
}

export function requireAuthenticated(
  verifyToken: SupabaseTokenVerifier,
  readProfile: ProfileReader,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      sendAuthorizationError(
        res,
        401,
        "AUTHENTICATION_REQUIRED",
        "A valid Supabase access token is required.",
      );
      return;
    }

    const token = authorization.slice("Bearer ".length).trim();
    if (!token) {
      sendAuthorizationError(
        res,
        401,
        "AUTHENTICATION_REQUIRED",
        "A valid Supabase access token is required.",
      );
      return;
    }

    let authUser: VerifiedSupabaseUser;
    try {
      authUser = await verifyToken(token);
    } catch {
      sendAuthorizationError(
        res,
        401,
        "INVALID_ACCESS_TOKEN",
        "The Supabase access token is invalid or expired.",
      );
      return;
    }

    try {
      const profile = await readProfile(authUser.id);
      if (!profile) {
        sendAuthorizationError(
          res,
          403,
          "PROFILE_REQUIRED",
          "No application profile exists for this authenticated user.",
        );
        return;
      }
      if (!profile.isActive) {
        sendAuthorizationError(
          res,
          403,
          "PROFILE_INACTIVE",
          "This application profile is inactive.",
        );
        return;
      }

      req.authenticatedUser = { authUser, profile };
      next();
    } catch (error) {
      next(error);
    }
  };
}

function requireRoles(...roles: ApplicationProfile["role"][]): RequestHandler {
  return (req, res, next) => {
    if (!req.authenticatedUser) {
      sendAuthorizationError(
        res,
        401,
        "AUTHENTICATION_REQUIRED",
        "Authentication must run before role authorization.",
      );
      return;
    }
    if (!roles.includes(req.authenticatedUser.profile.role)) {
      sendAuthorizationError(
        res,
        403,
        "INSUFFICIENT_ROLE",
        "This profile does not have permission to access the resource.",
      );
      return;
    }
    next();
  };
}

export const requireOwner = requireRoles("OWNER");
