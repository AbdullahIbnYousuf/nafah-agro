// @vitest-environment node
import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createExpenseRouter } from "./expenses.js";
import type { ExpenseService } from "../services/expenses.js";

const ownerId = "40000000-0000-4000-8000-000000000400";
function appWithService() {
  const service = {
    list: vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 })),
    summary: vi.fn(async () => ({ total: 0, count: 0, byMethod: [] })),
    suggestions: vi.fn(async () => ["দোকান ভাড়া"]),
    detail: vi.fn(async () => ({ id: ownerId })),
    create: vi.fn(async () => ({ id: ownerId })),
    update: vi.fn(async () => ({ id: ownerId })),
    void: vi.fn(async () => ({ id: ownerId })),
  };
  const authenticate: RequestHandler = (req, res, next) => {
    if (!req.header("x-role")) { res.sendStatus(401); return; }
    Object.assign(req, { authenticatedUser: { profile: { id: ownerId } } });
    next();
  };
  const requireOwner: RequestHandler = (req, res, next) => {
    if (req.header("x-role") !== "OWNER") { res.sendStatus(403); return; }
    next();
  };
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createExpenseRouter(service as unknown as ExpenseService, authenticate, requireOwner, (_req, _res, next) => next()));
  const errors: ErrorRequestHandler = (error: Error & { status?: number; code?: string }, _req, res, _next) => {
    res.status(error.status ?? 500).json({ code: error.code ?? "ERROR" });
  };
  app.use(errors);
  return { app, service };
}

describe("expense API authorization", () => {
  it("denies guests and customers across reads and writes", async () => {
    const { app, service } = appWithService();
    const paths = ["/api/v1/expenses", "/api/v1/expenses/summary", "/api/v1/expenses/names", "/api/v1/expenses/" + ownerId];
    for (const path of paths) {
      expect((await request(app).get(path)).status).toBe(401);
      expect((await request(app).get(path).set("x-role", "CUSTOMER")).status).toBe(403);
    }
    for (const [method, path] of [["post", "/api/v1/expenses"], ["patch", "/api/v1/expenses/" + ownerId], ["post", "/api/v1/expenses/" + ownerId + "/void"]] as const) {
      expect((await request(app)[method](path).set("x-role", "CUSTOMER")).status).toBe(403);
    }
    expect(service.list).not.toHaveBeenCalled();
    expect(service.create).not.toHaveBeenCalled();
  });
  it("allows an owner and validates before invoking the service", async () => {
    const { app, service } = appWithService();
    expect((await request(app).get("/api/v1/expenses").set("x-role", "OWNER")).status).toBe(200);
    expect((await request(app).post("/api/v1/expenses").set("x-role", "OWNER").send({ name: "ভাড়া", amount: "10", paidOn: "2026-09-01", idempotencyKey: "30000000-0000-4000-8000-000000000300" })).status).toBe(201);
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ paymentChannel: "CASH" }), ownerId);
    expect((await request(app).post("/api/v1/expenses").set("x-role", "OWNER").send({ amount: "-1" })).status).toBe(400);
  });
});
