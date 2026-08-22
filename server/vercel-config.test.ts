// @vitest-environment node

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface VercelConfiguration {
  builds?: unknown;
  routes?: unknown;
  regions?: string[];
  headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  rewrites?: Array<{ source: string; destination: string }>;
  crons?: Array<{ path: string; schedule: string }>;
}

const config = JSON.parse(
  readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
) as VercelConfiguration;

describe("single-project Vercel configuration", () => {
  it("uses standard file detection for one shared Express Function", () => {
    expect(config).not.toHaveProperty("builds");
    expect(config).not.toHaveProperty("routes");
    expect(config).not.toHaveProperty("framework");
    expect(config).not.toHaveProperty("buildCommand");
    expect(config).not.toHaveProperty("outputDirectory");

    const apiEntry = readFileSync(
      new URL("../api/index.ts", import.meta.url),
      "utf8",
    );
    expect(apiEntry).toContain('import app from "../server.js"');
    expect(apiEntry).toContain("export default app");
    expect(
      existsSync(new URL("../api/[...path].ts", import.meta.url)),
    ).toBe(false);
  });

  it("pins the Function near Supabase and caches only versioned static assets", () => {
    expect(config.regions).toEqual(["sin1"]);
    expect(config.headers).toContainEqual({
      source: "/assets/(.*)",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    });
    expect(config.headers?.some((entry) => entry.source.startsWith("/api"))).toBe(false);
  });

  it("schedules the credit reminder for 9 AM in Asia/Dhaka", () => {
    expect(config.crons).toEqual([{
      path: "/api/v1/cron/credit-reminders",
      schedule: "0 3 * * *",
    }]);
  });

  it("forwards health and unknown API paths to Express", () => {
    const apiRewrite = config.rewrites?.find(
      (rewrite) => rewrite.destination === "/api",
    );
    expect(apiRewrite).toEqual({
      source: "/api/(.*)",
      destination: "/api",
    });
    expect(apiRewrite?.source).not.toContain(":path");

    const spaRewrite = config.rewrites?.find(
      (rewrite) => rewrite.destination === "/index.html",
    );
    expect(spaRewrite).toBeDefined();

    const sourcePattern = new RegExp(`^${spaRewrite!.source}$`);
    for (const apiPath of ["/api/v1/health", "/api/v1/missing"]) {
      expect(sourcePattern.test(apiPath), apiPath).toBe(false);
    }
  });

  it("returns the SPA for public and nested admin routes without catching API paths", () => {
    const spaRewrite = config.rewrites?.find(
      (rewrite) => rewrite.destination === "/index.html",
    );
    const sourcePattern = new RegExp(`^${spaRewrite!.source}$`);

    for (const frontendPath of [
      "/",
      "/shop",
      "/admin",
      "/admin/dashboard",
      "/admin/products/new",
      "/admin/products/20000000-0000-4000-8000-000000000001/edit",
    ]) {
      expect(sourcePattern.test(frontendPath), frontendPath).toBe(true);
    }
    expect(sourcePattern.test("/api/v1/health")).toBe(false);
  });
});
