// @vitest-environment node

import { describe, expect, it } from "vitest";
import { parseBackendEnv } from "./env.js";

const validEnvironment = {
  NODE_ENV: "test",
};

describe("backend environment validation", () => {
  it("parses the base environment and reports PostgreSQL as optional", () => {
    const env = parseBackendEnv(validEnvironment);

    expect(env.PORT).toBe(4000);
    expect(env.FOUNDATION_CONFIGURED).toBe(false);
  });

  it("does not require a frontend URL for same-origin production", () => {
    const env = parseBackendEnv({ NODE_ENV: "production" });

    expect(env.NODE_ENV).toBe("production");
    expect(env).not.toHaveProperty("FRONTEND_URL");
    expect(env).not.toHaveProperty("CLIENT_URL");
  });

  it("does not expose retired custom authentication variables", () => {
    const env = parseBackendEnv({
      ...validEnvironment,
      JWT_SECRET: "ignored-retired-value",
      ADMIN_UNLOCK_CODE: "ignored-retired-value",
    });
    expect(env).not.toHaveProperty("JWT_SECRET");
    expect(env).not.toHaveProperty("ADMIN_UNLOCK_CODE");
  });

  it("requires PostgreSQL and Supabase configuration together", () => {
    expect(() =>
      parseBackendEnv({
        ...validEnvironment,
        DATABASE_URL: "postgresql://user:password@localhost:5432/nafah",
      }),
    ).toThrow("DATABASE_URL and SUPABASE_URL must be provided together");
  });
});
