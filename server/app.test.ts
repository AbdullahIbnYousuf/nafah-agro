// @vitest-environment node

import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { parseBackendEnv } from "./env.js";
import type { ApplicationProfile } from "./services/profiles.js";
import type { CatalogService } from "./services/catalog.js";

const baseEnvironment = {
  NODE_ENV: "test",
  MONGO_URI: "mongodb://127.0.0.1:27017/nafah_agro_test",
  FRONTEND_URL: "http://localhost:8080",
};

function createTestEnv(configureFoundation = false) {
  return parseBackendEnv({
    ...baseEnvironment,
    ...(configureFoundation
      ? {
          DATABASE_URL: "postgresql://user:password@localhost:5432/nafah",
          SUPABASE_URL: "https://project.supabase.co",
        }
      : {}),
  });
}

describe("GET /api/v1/health", () => {
  it("reports a healthy API when PostgreSQL is not configured", async () => {
    const response = await request(
      createApp({ env: createTestEnv() }),
    ).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      status: "ok",
      services: { api: "ready", postgres: "not_configured" },
    });
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f-]{27}$/,
    );
  });

  it("reports PostgreSQL readiness after a successful query", async () => {
    const checkDatabase = vi.fn().mockResolvedValue(undefined);
    const response = await request(
      createApp({
        env: createTestEnv(true),
        checkDatabase,
        verifySupabaseToken: vi.fn(),
        readFoundationRecord: vi.fn(),
      }),
    ).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body.data.services.postgres).toBe("ready");
    expect(checkDatabase).toHaveBeenCalledOnce();
  });

  it("returns a safe 503 response when PostgreSQL is unavailable", async () => {
    const response = await request(
      createApp({
        env: createTestEnv(true),
        checkDatabase: vi.fn().mockRejectedValue(new Error("credential leak")),
        verifySupabaseToken: vi.fn(),
        readFoundationRecord: vi.fn(),
      }),
    ).get("/api/v1/health");

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("DATABASE_UNAVAILABLE");
    expect(JSON.stringify(response.body)).not.toContain("credential leak");
  });
});

describe("GET /api/v1/foundation", () => {
  const ownerProfile: ApplicationProfile = {
    id: "4cd56ef4-56d8-4a22-92fe-887e6f601de6",
    role: "OWNER",
    fullName: "Initial Owner",
    phoneNumber: null,
    isActive: true,
  };

  function createProtectedApp(
    profile: ApplicationProfile | null = ownerProfile,
    protectedRateLimit = 60,
    catalogService?: CatalogService,
  ) {
    return createApp({
      env: parseBackendEnv({
        ...baseEnvironment,
        DATABASE_URL: "postgresql://user:password@localhost:5432/nafah",
        SUPABASE_URL: "https://project.supabase.co",
        PROTECTED_RATE_LIMIT_MAX: String(protectedRateLimit),
      }),
      checkDatabase: vi.fn(),
      verifySupabaseToken: vi.fn(async (token: string) => {
        if (token !== "valid-token") throw new Error("invalid token");
        return {
          id: "4cd56ef4-56d8-4a22-92fe-887e6f601de6",
          email: "owner@example.com",
          claims: { sub: "4cd56ef4-56d8-4a22-92fe-887e6f601de6" },
        };
      }),
      readProfile: vi.fn(async () => profile),
      readFoundationRecord: vi.fn(async () => ({
        key: "milestone-1",
        value: "Nafah Agro PostgreSQL foundation is ready",
        updatedAt: new Date("2026-07-30T00:00:00.000Z"),
      })),
      catalogService,
    });
  }

  it("rejects requests without a bearer token", async () => {
    const response = await request(createProtectedApp()).get(
      "/api/v1/foundation",
    );

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("rejects invalid access tokens", async () => {
    const response = await request(createProtectedApp())
      .get("/api/v1/foundation")
      .set("Authorization", "Bearer invalid-token");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_ACCESS_TOKEN");
  });

  it("returns a Prisma-backed record to an authenticated user", async () => {
    const response = await request(createProtectedApp())
      .get("/api/v1/foundation")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(response.body.data.authenticatedUser).toEqual({
      id: "4cd56ef4-56d8-4a22-92fe-887e6f601de6",
      email: "owner@example.com",
      role: "OWNER",
      fullName: "Initial Owner",
    });
    expect(response.body.data.record.key).toBe("milestone-1");
  });

  it("resolves the Supabase token to the PostgreSQL profile for the frontend", async () => {
    const response = await request(createProtectedApp())
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      id: ownerProfile.id,
      name: "Initial Owner",
      email: "owner@example.com",
      phoneNumber: null,
      role: "OWNER",
      isActive: true,
    });
  });

  it("rejects an authenticated user without a profile", async () => {
    const response = await request(createProtectedApp(null))
      .get("/api/v1/foundation")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("PROFILE_REQUIRED");
  });

  it("rejects an inactive profile", async () => {
    const response = await request(
      createProtectedApp({ ...ownerProfile, isActive: false }),
    )
      .get("/api/v1/foundation")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("PROFILE_INACTIVE");
  });

  it("denies a customer access to an admin route", async () => {
    const response = await request(
      createProtectedApp({ ...ownerProfile, role: "CUSTOMER" }),
    )
      .get("/api/v1/foundation/admin")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("INSUFFICIENT_ROLE");
  });

  it("allows an admin to access an admin route", async () => {
    const response = await request(
      createProtectedApp({ ...ownerProfile, role: "ADMIN" }),
    )
      .get("/api/v1/foundation/admin")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(response.body.data.authenticatedUser.role).toBe("ADMIN");
  });

  it("allows only an owner to access the owner route", async () => {
    const adminResponse = await request(
      createProtectedApp({ ...ownerProfile, role: "ADMIN" }),
    )
      .get("/api/v1/foundation/owner")
      .set("Authorization", "Bearer valid-token");
    const ownerResponse = await request(createProtectedApp())
      .get("/api/v1/foundation/owner")
      .set("Authorization", "Bearer valid-token");

    expect(adminResponse.status).toBe(403);
    expect(adminResponse.body.error.code).toBe("INSUFFICIENT_ROLE");
    expect(ownerResponse.status).toBe(200);
  });

  it("rate limits repeated protected requests", async () => {
    const app = createProtectedApp(ownerProfile, 2);

    await request(app)
      .get("/api/v1/foundation")
      .set("Authorization", "Bearer invalid-token");
    await request(app)
      .get("/api/v1/foundation")
      .set("Authorization", "Bearer invalid-token");
    const response = await request(app)
      .get("/api/v1/foundation")
      .set("Authorization", "Bearer invalid-token");

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(response.headers.ratelimit).toBeDefined();
  });

  it("repairs a missing customer profile only for the verified token subject", async () => {
    const writeCustomerProfile = vi.fn(async (id: string, fullName: string, phoneNumber: string) => ({
      id,
      role: "CUSTOMER" as const,
      fullName,
      phoneNumber,
      isActive: true,
    }));
    const app = createApp({
      env: createTestEnv(true),
      verifySupabaseToken: vi.fn(async () => ({
        id: ownerProfile.id,
        email: "customer@example.com",
        claims: {
          sub: ownerProfile.id,
          user_metadata: { full_name: "Customer", phone_number: "01700000000" },
        },
      })),
      readProfile: vi.fn(async () => null),
      readFoundationRecord: vi.fn(),
      checkDatabase: vi.fn(),
      writeCustomerProfile,
    });
    const response = await request(app)
      .post("/api/v1/auth/complete-customer-profile")
      .set("Authorization", "Bearer valid-token")
      .send({ fullName: "Ignored caller value", phoneNumber: "0000000" });

    expect(response.status).toBe(201);
    expect(writeCustomerProfile).toHaveBeenCalledWith(
      ownerProfile.id,
      "Customer",
      "01700000000",
    );
    expect(response.body.data.role).toBe("CUSTOMER");
  });

  describe("catalog authorization", () => {
    function catalogStub() {
      return {
        listCategories: vi.fn(async () => []),
        createCategory: vi.fn(async (input: { name: string; slug: string }) => ({
          id: "10000000-0000-4000-8000-000000000001",
          ...input,
          isActive: true,
        })),
        updateCategory: vi.fn(),
        listProducts: vi.fn(),
        getProductBySlug: vi.fn(),
        createProduct: vi.fn(),
        updateProduct: vi.fn(),
        createVariant: vi.fn(),
        updateVariant: vi.fn(),
        changePrice: vi.fn(),
        bulkChangePrices: vi.fn(),
        getPriceHistory: vi.fn(),
      } as unknown as CatalogService;
    }

    it.each(["OWNER", "ADMIN"] as const)("allows %s to create a category", async (role) => {
      const catalog = catalogStub();
      const response = await request(createProtectedApp({ ...ownerProfile, role }, 60, catalog))
        .post("/api/v1/categories")
        .set("Authorization", "Bearer valid-token")
        .send({ name: "Dairy", slug: "dairy" });

      expect(response.status).toBe(201);
      expect(catalog.createCategory).toHaveBeenCalledWith({ name: "Dairy", slug: "dairy" });
    });

    it("denies CUSTOMER catalog mutations before the service is called", async () => {
      const catalog = catalogStub();
      const response = await request(
        createProtectedApp({ ...ownerProfile, role: "CUSTOMER" }, 60, catalog),
      )
        .post("/api/v1/categories")
        .set("Authorization", "Bearer valid-token")
        .send({ name: "Dairy", slug: "dairy" });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("INSUFFICIENT_ROLE");
      expect(catalog.createCategory).not.toHaveBeenCalled();
    });
  });
});
