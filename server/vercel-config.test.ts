// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface VercelConfiguration {
  framework?: string;
  buildCommand?: string;
  outputDirectory?: string;
  rewrites?: Array<{ source: string; destination: string }>;
}

const config = JSON.parse(
  readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
) as VercelConfiguration;

describe("single-project Vercel configuration", () => {
  it("builds the Vite frontend and exposes the shared Express app from api/", () => {
    expect(config.framework).toBe("vite");
    expect(config.buildCommand).toBe("npm run build");
    expect(config.outputDirectory).toBe("dist");

    const apiEntry = readFileSync(
      new URL("../api/[...path].ts", import.meta.url),
      "utf8",
    );
    expect(apiEntry).toContain('import app from "../server.js"');
    expect(apiEntry).toContain("export default app");
  });

  it("rewrites React Router paths but excludes every API path", () => {
    const spaRewrite = config.rewrites?.find(
      (rewrite) => rewrite.destination === "/index.html",
    );
    expect(spaRewrite).toBeDefined();

    const sourcePattern = new RegExp(`^${spaRewrite!.source}$`);
    for (const frontendPath of [
      "/",
      "/shop",
      "/admin",
      "/products/raw-honey",
      "/assets/index.js",
    ]) {
      expect(sourcePattern.test(frontendPath), frontendPath).toBe(true);
    }
    for (const apiPath of ["/api", "/api/v1/health", "/api/v1/missing"]) {
      expect(sourcePattern.test(apiPath), apiPath).toBe(false);
    }
  });
});
