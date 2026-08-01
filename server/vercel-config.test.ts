// @vitest-environment node

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface VercelConfiguration {
  builds?: unknown;
  routes?: unknown;
  rewrites?: Array<{ source: string; destination: string }>;
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

  it("returns the SPA for /admin without catching API paths", () => {
    const spaRewrite = config.rewrites?.find(
      (rewrite) => rewrite.destination === "/index.html",
    );
    const sourcePattern = new RegExp(`^${spaRewrite!.source}$`);

    expect(sourcePattern.test("/admin")).toBe(true);
    expect(sourcePattern.test("/api/v1/health")).toBe(false);
  });
});
