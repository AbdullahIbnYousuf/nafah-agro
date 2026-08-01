import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { createOrderRouter } from "./routes/orders.js";
import uploadRoutes from "./routes/upload.js";
import { createCatalogRouter } from "./routes/catalog.js";
import { createInventoryRouter } from "./routes/inventory.js";
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
  requireSupabaseUser,
} from "./middleware/supabaseAuth.js";
import {
  createDatabaseHealthCheck,
  createFoundationRecordReader,
  type DatabaseHealthCheck,
  type FoundationRecordReader,
} from "./services/foundation.js";
import {
  createCustomerProfileWriter,
  createProfileReader,
  type CustomerProfileWriter,
  type ProfileReader,
} from "./services/profiles.js";
import { createCatalogService, type CatalogService } from "./services/catalog.js";
import { createInventoryService, type InventoryService } from "./services/inventory.js";
import { createUnifiedOrderService, type UnifiedOrderService } from "./services/orders.js";

export interface AppDependencies {
  env: BackendEnv;
  verifySupabaseToken?: SupabaseTokenVerifier;
  readProfile?: ProfileReader;
  readFoundationRecord?: FoundationRecordReader;
  checkDatabase?: DatabaseHealthCheck;
  catalogService?: CatalogService;
  inventoryService?: InventoryService;
  orderService?: UnifiedOrderService;
  writeCustomerProfile?: CustomerProfileWriter;
}

interface HttpError extends Error {
  status?: number;
  code?: string;
  details?: Record<string, unknown>;
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
      catalogService: undefined,
      inventoryService: undefined,
      orderService: undefined,
      writeCustomerProfile: undefined,
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
    catalogService: createCatalogService(prisma),
    inventoryService: createInventoryService(prisma),
    orderService: createUnifiedOrderService(prisma),
    writeCustomerProfile: createCustomerProfileWriter(prisma),
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
  const catalogService = dependencies.catalogService ?? getDefaults().catalogService;
  const inventoryService = dependencies.inventoryService ?? getDefaults().inventoryService;
  const orderService = dependencies.orderService ?? getDefaults().orderService;
  const writeCustomerProfile = dependencies.writeCustomerProfile ?? getDefaults().writeCustomerProfile;
  const allowedOrigins = new Set([dependencies.env.FRONTEND_URL]);
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
  const verifyAuthUser = requireSupabaseUser(verifySupabaseToken);
  const optionalAuthenticate: express.RequestHandler = (req, res, next) => {
    if (!req.header("Authorization")) {
      next();
      return;
    }
    authenticate(req, res, next);
  };

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

  app.get(
    "/api/v1/auth/me",
    protectedRouteLimiter,
    authenticate,
    (req, res) => {
      const principal = req.authenticatedUser!;
      res.json({
        success: true,
        data: {
          id: principal.profile.id,
          name: principal.profile.fullName,
          email: principal.authUser.email ?? null,
          phoneNumber: principal.profile.phoneNumber,
          role: principal.profile.role,
          isActive: principal.profile.isActive,
        },
      });
    },
  );

  app.post(
    "/api/v1/auth/complete-customer-profile",
    protectedRouteLimiter,
    verifyAuthUser,
    async (req, res, next) => {
      if (!writeCustomerProfile) {
        res.status(503).json({
          success: false,
          error: { code: "POSTGRES_NOT_CONFIGURED", message: "PostgreSQL is not configured.", details: {} },
        });
        return;
      }
      const parsed = z.object({
        fullName: z.string().trim().min(1).max(120),
        phoneNumber: z.string().trim().min(7).max(30),
      }).safeParse({
        fullName: req.verifiedSupabaseUser!.claims.user_metadata
          && typeof req.verifiedSupabaseUser!.claims.user_metadata === "object"
          ? (req.verifiedSupabaseUser!.claims.user_metadata as Record<string, unknown>).full_name
          : undefined,
        phoneNumber: req.verifiedSupabaseUser!.claims.user_metadata
          && typeof req.verifiedSupabaseUser!.claims.user_metadata === "object"
          ? (req.verifiedSupabaseUser!.claims.user_metadata as Record<string, unknown>).phone_number
          : undefined,
      });
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: { code: "PROFILE_METADATA_REQUIRED", message: "The verified Supabase token must contain a valid name and phone number.", details: {} },
        });
        return;
      }
      try {
        const profile = await writeCustomerProfile(
          req.verifiedSupabaseUser!.id,
          parsed.data.fullName,
          parsed.data.phoneNumber,
        );
        res.status(201).json({ success: true, data: profile });
      } catch (error) {
        next(error);
      }
    },
  );

  if (catalogService) {
    app.use(
      "/api/v1",
      createCatalogRouter(
        catalogService,
        authenticate,
        requireAdminOrOwner,
        protectedRouteLimiter,
      ),
    );
  } else {
    app.use(["/api/v1/admin", "/api/v1/categories", "/api/v1/products", "/api/v1/variants"], (_req, res) => {
      res.status(503).json({
        success: false,
        error: { code: "POSTGRES_NOT_CONFIGURED", message: "PostgreSQL is not configured.", details: {} },
      });
    });
  }

  if (inventoryService) {
    app.use(
      "/api/v1",
      createInventoryRouter(
        inventoryService,
        authenticate,
        requireAdminOrOwner,
        protectedRouteLimiter,
      ),
    );
  } else {
    app.use(
      ["/api/v1/stock-batches", "/api/v1/purchases", "/api/v1/stock-adjustments", "/api/v1/physical-sales"],
      (_req, res) => {
        res.status(503).json({
          success: false,
          error: { code: "POSTGRES_NOT_CONFIGURED", message: "PostgreSQL is not configured.", details: {} },
        });
      },
    );
  }

  if (orderService) {
    app.use(
      "/api/v1",
      createOrderRouter(
        orderService,
        optionalAuthenticate,
        authenticate,
        requireAdminOrOwner,
        protectedRouteLimiter,
      ),
    );
  } else {
    app.use(["/api/v1/orders", "/api/v1/delivery-rates"], (_req, res) => {
      res.status(503).json({
        success: false,
        error: { code: "POSTGRES_NOT_CONFIGURED", message: "PostgreSQL is not configured.", details: {} },
      });
    });
  }

  app.use("/api/upload", protectedRouteLimiter, authenticate, requireAdminOrOwner, uploadRoutes);
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
            details: { ...httpError.details, requestId },
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
