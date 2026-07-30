import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { randomUUID } from "node:crypto";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import productRoutes from "./routes/products.js";
import categoryRoutes from "./routes/categories.js";
import orderRoutes from "./routes/orders.js";
import uploadRoutes from "./routes/upload.js";
import authRoutes from "./routes/auth.js";
import type { BackendEnv } from "./env.js";
import { getPrismaClient } from "./lib/prisma.js";
import {
  createSupabaseTokenVerifier,
  type SupabaseTokenVerifier,
} from "./lib/supabaseAuth.js";
import {
  requireAdminOrOwner,
  requireAuthenticated,
  requireOwner,
} from "./middleware/supabaseAuth.js";
import {
  createDatabaseHealthCheck,
  createFoundationRecordReader,
  type DatabaseHealthCheck,
  type FoundationRecordReader,
} from "./services/foundation.js";
import {
  createProfileReader,
  type ProfileReader,
} from "./services/profiles.js";

export interface AppDependencies {
  env: BackendEnv;
  verifySupabaseToken?: SupabaseTokenVerifier;
  readProfile?: ProfileReader;
  readFoundationRecord?: FoundationRecordReader;
  checkDatabase?: DatabaseHealthCheck;
}

interface HttpError extends Error {
  status?: number;
  code?: string;
}

function unavailableTokenVerifier(): SupabaseTokenVerifier {
  return async () => {
    throw new Error("Supabase foundation is not configured");
  };
}

function unavailableRecordReader(): FoundationRecordReader {
  return async () => {
    throw new Error("PostgreSQL foundation is not configured");
  };
}

function unavailableProfileReader(): ProfileReader {
  return async () => {
    throw new Error("PostgreSQL profile foundation is not configured");
  };
}

function getFoundationDependencies(env: BackendEnv) {
  if (!env.FOUNDATION_CONFIGURED || !env.DATABASE_URL || !env.SUPABASE_URL) {
    return {
      verifySupabaseToken: unavailableTokenVerifier(),
      readProfile: unavailableProfileReader(),
      readFoundationRecord: unavailableRecordReader(),
      checkDatabase: undefined,
    };
  }

  const prisma = getPrismaClient(env.DATABASE_URL);
  return {
    verifySupabaseToken: createSupabaseTokenVerifier(
      env.SUPABASE_URL,
      env.SUPABASE_JWT_AUDIENCE,
    ),
    readProfile: createProfileReader(prisma),
    readFoundationRecord: createFoundationRecordReader(prisma),
    checkDatabase: createDatabaseHealthCheck(prisma),
  };
}

export function createApp(dependencies: AppDependencies) {
  const app = express();
  let cachedDefaults:
    | ReturnType<typeof getFoundationDependencies>
    | undefined;
  const getDefaults = () => {
    cachedDefaults ??= getFoundationDependencies(dependencies.env);
    return cachedDefaults;
  };
  const verifySupabaseToken =
    dependencies.verifySupabaseToken ?? getDefaults().verifySupabaseToken;
  const readProfile = dependencies.readProfile ?? getDefaults().readProfile;
  const readFoundationRecord =
    dependencies.readFoundationRecord ?? getDefaults().readFoundationRecord;
  const checkDatabase =
    dependencies.checkDatabase ?? getDefaults().checkDatabase;
  const allowedOrigins = new Set([dependencies.env.FRONTEND_URL]);
  const authenticationLimiter = rateLimit({
    windowMs: dependencies.env.RATE_LIMIT_WINDOW_MS,
    limit: dependencies.env.AUTH_RATE_LIMIT_MAX,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many authentication requests. Try again later.",
        details: {},
      },
    },
  });
  const protectedRouteLimiter = rateLimit({
    windowMs: dependencies.env.RATE_LIMIT_WINDOW_MS,
    limit: dependencies.env.PROTECTED_RATE_LIMIT_MAX,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many protected API requests. Try again later.",
        details: {},
      },
    },
  });
  const authenticate = requireAuthenticated(verifySupabaseToken, readProfile);

  app.disable("x-powered-by");
  if (dependencies.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const suppliedRequestId = req.header("X-Request-ID");
    const requestId =
      suppliedRequestId && /^[A-Za-z0-9_-]{8,128}$/.test(suppliedRequestId)
        ? suppliedRequestId
        : randomUUID();
    res.setHeader("X-Request-ID", requestId);
    res.on("finish", () => {
      const line = JSON.stringify({
        time: new Date().toISOString(),
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        ms: Date.now() - start,
        ip: req.ip,
      });
      if (res.statusCode >= 500) console.error(line);
      else if (res.statusCode >= 400) console.warn(line);
      else if (dependencies.env.NODE_ENV !== "test") console.log(line);
    });
    next();
  });
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }
        const error: HttpError = new Error("Origin is not allowed by CORS");
        error.status = 403;
        error.code = "CORS_ORIGIN_DENIED";
        callback(error);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    }),
  );
  app.use(express.json({ limit: dependencies.env.JSON_BODY_LIMIT }));

  app.get("/api/v1/health", async (_req, res, next) => {
    if (!checkDatabase) {
      res.json({
        success: true,
        data: {
          status: "ok",
          services: { api: "ready", postgres: "not_configured" },
        },
      });
      return;
    }

    try {
      await checkDatabase();
      res.json({
        success: true,
        data: {
          status: "ok",
          services: { api: "ready", postgres: "ready" },
        },
      });
    } catch {
      res.status(503).json({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database health check failed.",
          details: {},
        },
      });
    }
  });

  const sendFoundationRecord: express.RequestHandler = async (
    req,
    res,
    next,
  ) => {
    if (!dependencies.env.FOUNDATION_CONFIGURED) {
      res.status(503).json({
        success: false,
        error: {
          code: "FOUNDATION_NOT_CONFIGURED",
          message: "The PostgreSQL and Supabase foundation is not configured.",
          details: {},
        },
      });
      return;
    }

    try {
      const record = await readFoundationRecord();
      if (!record) {
        res.status(404).json({
          success: false,
          error: {
            code: "FOUNDATION_RECORD_NOT_FOUND",
            message: "The Milestone 1 foundation record has not been seeded.",
            details: {},
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          authenticatedUser: {
            id: req.authenticatedUser!.authUser.id,
            email: req.authenticatedUser!.authUser.email,
            role: req.authenticatedUser!.profile.role,
            fullName: req.authenticatedUser!.profile.fullName,
          },
          record,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  app.get(
    "/api/v1/foundation",
    protectedRouteLimiter,
    authenticate,
    sendFoundationRecord,
  );
  app.get(
    "/api/v1/foundation/admin",
    protectedRouteLimiter,
    authenticate,
    requireAdminOrOwner,
    sendFoundationRecord,
  );
  app.get(
    "/api/v1/foundation/owner",
    protectedRouteLimiter,
    authenticate,
    requireOwner,
    sendFoundationRecord,
  );

  // Legacy MVP endpoints remain available until their PostgreSQL replacements exist.
  app.use("/api/auth", authenticationLimiter, authRoutes);
  app.use("/api/products", productRoutes);
  app.use("/api/categories", categoryRoutes);
  app.use("/api/orders", orderRoutes);
  app.use("/api/upload", uploadRoutes);
  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use(
    (error: unknown, req: Request, res: Response, _next: NextFunction) => {
      const httpError = error as HttpError;
      const isProduction = dependencies.env.NODE_ENV === "production";
      const status =
        typeof httpError.status === "number" &&
        httpError.status >= 400 &&
        httpError.status <= 599
          ? httpError.status
          : 500;
      const message =
        error instanceof Error ? error.message : "Internal Server Error";
      const responseMessage =
        isProduction && status >= 500 ? "Internal Server Error" : message;
      const requestId = res.getHeader("X-Request-ID");

      console.error(
        JSON.stringify({
          time: new Date().toISOString(),
          level: "error",
          requestId,
          method: req.method,
          path: req.originalUrl,
          message,
          stack:
            !isProduction && error instanceof Error ? error.stack : undefined,
        }),
      );

      if (req.path.startsWith("/api/v1/")) {
        res.status(status).json({
          success: false,
          error: {
            code:
              typeof httpError.code === "string"
                ? httpError.code
                : "INTERNAL_SERVER_ERROR",
            message: responseMessage,
            details: { requestId },
          },
        });
        return;
      }

      res.status(status).json({
        error: responseMessage,
      });
    },
  );

  return app;
}
