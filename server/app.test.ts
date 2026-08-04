// @vitest-environment node

import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { parseBackendEnv } from "./env.js";
import type { ApplicationProfile } from "./services/profiles.js";
import type { CatalogService } from "./services/catalog.js";
import type { InventoryService } from "./services/inventory.js";
import type { UnifiedOrderService } from "./services/orders.js";
import type { AccountService } from "./services/accounts.js";
import type { AnalyticsService } from "./services/analytics.js";

const baseEnvironment = {
  NODE_ENV: "test",
};

const productionEnvironment = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:password@localhost:5432/nafah",
  SUPABASE_URL: "https://project.supabase.co",
  CLOUDINARY_CLOUD_NAME: "cloud",
  CLOUDINARY_API_KEY: "key",
  CLOUDINARY_API_SECRET: "secret",
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

describe("single-project deployment behavior", () => {
  it("allows the checked-in Vite origins during local development", async () => {
    const response = await request(createApp({ env: createTestEnv() }))
      .get("/api/v1/health")
      .set("Origin", "http://localhost:8080");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:8080",
    );
  });

  it("rejects unknown cross-origin requests during local development", async () => {
    const response = await request(createApp({ env: createTestEnv() }))
      .get("/api/v1/health")
      .set("Origin", "https://untrusted.example");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("CORS_ORIGIN_DENIED");
    expect(response.body.error.message).toBe("Origin is not allowed by CORS");
  });

  it("does not enable cross-origin access in same-origin production", async () => {
    const response = await request(
      createApp({
        env: parseBackendEnv(productionEnvironment),
        checkDatabase: vi.fn(),
        verifySupabaseToken: vi.fn(),
        readFoundationRecord: vi.fn(),
      }),
    )
      .get("/api/v1/health")
      .set("Origin", "https://untrusted.example");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("returns a JSON API 404 instead of falling through to the SPA", async () => {
    const response = await request(createApp({ env: createTestEnv() })).get(
      "/api/v1/not-a-route",
    );

    expect(response.status).toBe(404);
    expect(response.type).toMatch(/json/);
    expect(response.body.error.code).toBe("API_NOT_FOUND");
  });

  it("hides database codes, details, and messages from production 500 responses", async () => {
    const profile: ApplicationProfile = {
      id: "4cd56ef4-56d8-4a22-92fe-887e6f601de6",
      role: "OWNER",
      fullName: "Owner",
      phoneNumber: null,
      isActive: true,
    };
    const response = await request(createApp({
      env: parseBackendEnv(productionEnvironment),
      checkDatabase: vi.fn(),
      verifySupabaseToken: vi.fn(async () => ({ id: profile.id, claims: { sub: profile.id } })),
      readProfile: vi.fn(async () => profile),
      readFoundationRecord: vi.fn(async () => {
        throw Object.assign(new Error("database credential leak"), {
          code: "P2002",
          details: { sql: "secret query" },
        });
      }),
    }))
      .get("/api/v1/foundation")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(500);
    expect(response.body.error).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal Server Error",
    });
    expect(JSON.stringify(response.body)).not.toMatch(/credential|P2002|secret query/);
  });
});

describe("image upload security", () => {
  const ownerProfile: ApplicationProfile = {
    id: "4cd56ef4-56d8-4a22-92fe-887e6f601de6",
    role: "OWNER",
    fullName: "Initial Owner",
    phoneNumber: null,
    isActive: true,
  };

  function uploadApp(role: ApplicationProfile["role"] = "OWNER") {
    const uploadImage = vi.fn(async () => "https://res.cloudinary.com/demo/image/upload/sample.webp");
    const app = createApp({
      env: createTestEnv(true),
      verifySupabaseToken: vi.fn(async () => ({
        id: ownerProfile.id,
        email: "owner@example.com",
        claims: { sub: ownerProfile.id },
      })),
      readProfile: vi.fn(async () => ({ ...ownerProfile, role })),
      readFoundationRecord: vi.fn(),
      checkDatabase: vi.fn(),
      uploadImage,
    });
    return { app, uploadImage };
  }

  it("requires OWNER authorization before processing an image", async () => {
    const { app, uploadImage } = uploadApp("CUSTOMER");
    const response = await request(app)
      .post("/api/v1/upload/multiple")
      .set("Authorization", "Bearer valid-token")
      .attach("images", Buffer.from("image"), { filename: "image.png", contentType: "image/png" });
    expect(response.status).toBe(403);
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("rejects unsupported MIME types", async () => {
    const { app, uploadImage } = uploadApp();
    const response = await request(app)
      .post("/api/v1/upload/multiple")
      .set("Authorization", "Bearer valid-token")
      .attach("images", Buffer.from("not-image"), { filename: "payload.svg", contentType: "image/svg+xml" });
    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe("UNSUPPORTED_IMAGE_TYPE");
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("rejects files larger than five megabytes", async () => {
    const { app, uploadImage } = uploadApp();
    const response = await request(app)
      .post("/api/v1/upload/multiple")
      .set("Authorization", "Bearer valid-token")
      .attach("images", Buffer.alloc(5 * 1024 * 1024 + 1), { filename: "large.jpg", contentType: "image/jpeg" });
    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("IMAGE_TOO_LARGE");
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("uploads an allowed image to the fixed Nafah Agro folder", async () => {
    const { app, uploadImage } = uploadApp();
    const response = await request(app)
      .post("/api/v1/upload/multiple")
      .set("Authorization", "Bearer valid-token")
      .attach("images", Buffer.from("image"), { filename: "product.webp", contentType: "image/webp" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { urls: ["https://res.cloudinary.com/demo/image/upload/sample.webp"] },
    });
    expect(uploadImage).toHaveBeenCalledWith(expect.any(Buffer), "nafah-agro");
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
    inventoryService?: InventoryService,
    orderService?: UnifiedOrderService,
    accountService?: AccountService,
    analyticsService?: AnalyticsService,
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
      inventoryService,
      orderService,
      accountService,
      analyticsService,
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

  it("updates the authenticated user's own profile", async () => {
    const accountService = {
      updateOwnProfile: vi.fn(async () => ({ ...ownerProfile, fullName: "Updated Owner", phoneNumber: "01700000000" })),
      listOwners: vi.fn(), inviteOwner: vi.fn(), setOwnerActive: vi.fn(),
    } as unknown as AccountService;
    const response = await request(createProtectedApp(ownerProfile, 60, undefined, undefined, undefined, accountService))
      .patch("/api/v1/auth/me")
      .set("Authorization", "Bearer valid-token")
      .send({ fullName: "Updated Owner", phoneNumber: "01700000000" });

    expect(response.status).toBe(200);
    expect(accountService.updateOwnProfile).toHaveBeenCalledWith(ownerProfile.id, {
      fullName: "Updated Owner", phoneNumber: "01700000000",
    });
    expect(response.body.data).toMatchObject({ name: "Updated Owner", role: "OWNER" });
  });

  describe("owner account API", () => {
    function accountStub() {
      return {
        updateOwnProfile: vi.fn(),
        listOwners: vi.fn(async () => []),
        inviteOwner: vi.fn(async () => ({ id: "owner-2", role: "OWNER", fullName: "Second Owner" })),
        setOwnerActive: vi.fn(async () => ({ id: "owner-2", role: "OWNER", isActive: false })),
      } as unknown as AccountService;
    }

    it("allows an OWNER to invite another owner", async () => {
      const accountService = accountStub();
      const response = await request(createProtectedApp(ownerProfile, 60, undefined, undefined, undefined, accountService))
        .post("/api/v1/owners/invitations")
        .set("Authorization", "Bearer valid-token")
        .send({ fullName: "Second Owner", phoneNumber: "01800000000", email: "second@example.com" });
      expect(response.status).toBe(201);
      expect(accountService.inviteOwner).toHaveBeenCalledWith(ownerProfile.id, {
        fullName: "Second Owner", phoneNumber: "01800000000", email: "second@example.com",
      });
    });

    it("denies CUSTOMER access before owner services run", async () => {
      const accountService = accountStub();
      const response = await request(createProtectedApp(
        { ...ownerProfile, role: "CUSTOMER" }, 60, undefined, undefined, undefined, accountService,
      ))
        .get("/api/v1/owners")
        .set("Authorization", "Bearer valid-token");
      expect(response.status).toBe(403);
      expect(accountService.listOwners).not.toHaveBeenCalled();
    });

    it("validates owner invitations and status reasons", async () => {
      const accountService = accountStub();
      const app = createProtectedApp(ownerProfile, 60, undefined, undefined, undefined, accountService);
      const inviteResponse = await request(app)
        .post("/api/v1/owners/invitations")
        .set("Authorization", "Bearer valid-token")
        .send({ fullName: "Second Owner", phoneNumber: "1", email: "invalid" });
      const statusResponse = await request(app)
        .patch("/api/v1/owners/10000000-0000-4000-8000-000000000002/status")
        .set("Authorization", "Bearer valid-token")
        .send({ isActive: false, reason: "x" });
      expect(inviteResponse.status).toBe(400);
      expect(statusResponse.status).toBe(400);
      expect(accountService.inviteOwner).not.toHaveBeenCalled();
      expect(accountService.setOwnerActive).not.toHaveBeenCalled();
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

  it("denies a customer access to an owner route", async () => {
    const response = await request(
      createProtectedApp({ ...ownerProfile, role: "CUSTOMER" }),
    )
      .get("/api/v1/foundation/owner")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("INSUFFICIENT_ROLE");
  });

  it("allows an owner to access the owner route", async () => {
    const response = await request(createProtectedApp())
      .get("/api/v1/foundation/owner")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(response.body.data.authenticatedUser.role).toBe("OWNER");
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

    it("allows an OWNER to create a category", async () => {
      const catalog = catalogStub();
      const response = await request(createProtectedApp(ownerProfile, 60, catalog))
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

  describe("Milestone 3 inventory authorization", () => {
    function inventoryStub() {
      return {
        listBatches: vi.fn(async () => []),
        createPurchase: vi.fn(async () => ({ purchaseGroupId: "30000000-0000-4000-8000-000000000001", batches: [] })),
        adjustStock: vi.fn(async () => []),
        createPhysicalSale: vi.fn(),
        listPhysicalSales: vi.fn(async () => []),
      } as unknown as InventoryService;
    }

    it("allows an OWNER to create purchases", async () => {
      const inventory = inventoryStub();
      const response = await request(createProtectedApp(ownerProfile, 60, undefined, inventory))
        .post("/api/v1/purchases")
        .set("Authorization", "Bearer valid-token")
        .send({
          purchaseDate: "2026-08-01",
          items: [{
            productVariantId: "10000000-0000-4000-8000-000000000001",
            quantity: 5,
            unitBuyingCost: "250.00",
          }],
        });

      expect(response.status).toBe(201);
      expect(inventory.createPurchase).toHaveBeenCalledWith(
        expect.objectContaining({ purchaseDate: "2026-08-01" }),
        ownerProfile.id,
      );
    });

    it("denies CUSTOMER inventory and physical-sale mutations", async () => {
      const inventory = inventoryStub();
      const app = createProtectedApp({ ...ownerProfile, role: "CUSTOMER" }, 60, undefined, inventory);
      const purchaseResponse = await request(app)
        .post("/api/v1/purchases")
        .set("Authorization", "Bearer valid-token")
        .send({});
      const saleResponse = await request(app)
        .post("/api/v1/physical-sales")
        .set("Authorization", "Bearer valid-token")
        .send({});

      expect(purchaseResponse.status).toBe(403);
      expect(saleResponse.status).toBe(403);
      expect(inventory.createPurchase).not.toHaveBeenCalled();
      expect(inventory.createPhysicalSale).not.toHaveBeenCalled();
    });
  });

  describe("Milestone 4 unified-order authorization", () => {
    function orderStub() {
      return {
        listDeliveryRates: vi.fn(async () => []),
        updateDeliveryRate: vi.fn(),
        createWebsiteOrder: vi.fn(async () => ({ order: { id: "order-1", status: "PENDING" }, replayed: false })),
        createManualOrder: vi.fn(async () => ({ id: "order-2" })),
        listOrders: vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 30, totalPages: 0 })),
        listCustomerWebsiteOrders: vi.fn(async () => []),
        transitionOrder: vi.fn(),
      } as unknown as UnifiedOrderService;
    }

    it("exposes only the public delivery-rate view to guests and reserves the full view for OWNER", async () => {
      const orders = orderStub();
      const app = createProtectedApp(ownerProfile, 60, undefined, undefined, orders);
      const publicResponse = await request(app).get("/api/v1/delivery-rates");
      const ownerResponse = await request(app)
        .get("/api/v1/admin/delivery-rates")
        .set("Authorization", "Bearer valid-token");

      expect(publicResponse.status).toBe(200);
      expect(ownerResponse.status).toBe(200);
      expect(orders.listDeliveryRates).toHaveBeenNthCalledWith(1, false);
      expect(orders.listDeliveryRates).toHaveBeenNthCalledWith(2, true);
    });

    it("denies CUSTOMER access to the full delivery-rate view", async () => {
      const orders = orderStub();
      const response = await request(createProtectedApp(
        { ...ownerProfile, role: "CUSTOMER" }, 60, undefined, undefined, orders,
      ))
        .get("/api/v1/admin/delivery-rates")
        .set("Authorization", "Bearer valid-token");
      expect(response.status).toBe(403);
      expect(orders.listDeliveryRates).not.toHaveBeenCalled();
    });

    it("allows guest website COD checkout without authentication", async () => {
      const orders = orderStub();
      const response = await request(createProtectedApp(ownerProfile, 60, undefined, undefined, orders))
        .post("/api/v1/orders/website")
        .send({
          items: [{ productVariantId: "10000000-0000-4000-8000-000000000001", quantity: 1 }],
          customer: { name: "Guest", phone: "01700000000", address: "Dhaka address" },
          deliveryRateId: "30000000-0000-4000-8000-000000000001",
          idempotencyKey: "guest-checkout-001",
        });

      expect(response.status).toBe(201);
      expect(orders.createWebsiteOrder).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "guest-checkout-001" }), undefined);
    });

    it("allows an OWNER to list unified orders", async () => {
      const orders = orderStub();
      const response = await request(createProtectedApp(ownerProfile, 60, undefined, undefined, orders))
        .get("/api/v1/orders")
        .set("Authorization", "Bearer valid-token");
      expect(response.status).toBe(200);
      expect(orders.listOrders).toHaveBeenCalledOnce();
    });

    it("denies CUSTOMER order management", async () => {
      const orders = orderStub();
      const response = await request(createProtectedApp({ ...ownerProfile, role: "CUSTOMER" }, 60, undefined, undefined, orders))
        .post("/api/v1/orders/manual")
        .set("Authorization", "Bearer valid-token")
        .send({});
      expect(response.status).toBe(403);
      expect(orders.createManualOrder).not.toHaveBeenCalled();
    });
  });

  describe("Milestone 5 analytics authorization", () => {
    function analyticsStub() {
      return {
        getDashboard: vi.fn(async () => ({
          currency: "BDT",
          timezone: "Asia/Dhaka",
          summary: { recognizedSales: { value: 1200 } },
        })),
      } as unknown as AnalyticsService;
    }

    it("allows an OWNER to read the dashboard", async () => {
      const analytics = analyticsStub();
      const response = await request(createProtectedApp(
        ownerProfile,
        60,
        undefined,
        undefined,
        undefined,
        undefined,
        analytics,
      ))
        .get("/api/v1/analytics/dashboard?preset=week")
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(200);
      expect(response.body.data.currency).toBe("BDT");
      expect(analytics.getDashboard).toHaveBeenCalledWith({ preset: "week" });
    });

    it("denies CUSTOMER analytics access before querying data", async () => {
      const analytics = analyticsStub();
      const response = await request(createProtectedApp(
        { ...ownerProfile, role: "CUSTOMER" },
        60,
        undefined,
        undefined,
        undefined,
        undefined,
        analytics,
      ))
        .get("/api/v1/analytics/dashboard?preset=today")
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("INSUFFICIENT_ROLE");
      expect(analytics.getDashboard).not.toHaveBeenCalled();
    });

    it("rejects an invalid custom range before querying data", async () => {
      const analytics = analyticsStub();
      const response = await request(createProtectedApp(
        ownerProfile,
        60,
        undefined,
        undefined,
        undefined,
        undefined,
        analytics,
      ))
        .get("/api/v1/analytics/dashboard?preset=custom&from=2026-08-05&to=2026-08-04")
        .set("Authorization", "Bearer valid-token");

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(analytics.getDashboard).not.toHaveBeenCalled();
    });
  });
});
