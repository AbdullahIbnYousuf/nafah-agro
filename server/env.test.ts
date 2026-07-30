// @vitest-environment node

import { describe, expect, it } from "vitest";
import { parseBackendEnv } from "./env.js";

const validLegacyEnvironment = {
  NODE_ENV: "test",
  MONGO_URI: "mongodb://127.0.0.1:27017/nafah_agro_test",
  FRONTEND_URL: "http://localhost:8080",
  JWT_SECRET: "a-development-secret-with-32-characters",
  ADMIN_UNLOCK_CODE: "local-unlock-code",
};

describe("backend environment validation", () => {
  it("parses required legacy variables and reports PostgreSQL as optional", () => {
    const env = parseBackendEnv(validLegacyEnvironment);

    expect(env.PORT).toBe(4000);
    expect(env.FRONTEND_URL).toBe("http://localhost:8080");
    expect(env.FOUNDATION_CONFIGURED).toBe(false);
  });

  it("rejects insecure fallback-sized secrets", () => {
    expect(() =>
      parseBackendEnv({
        ...validLegacyEnvironment,
        JWT_SECRET: "short",
      }),
    ).toThrow("JWT_SECRET must contain at least 32 characters");
  });

  it("requires PostgreSQL and Supabase configuration together", () => {
    expect(() =>
      parseBackendEnv({
        ...validLegacyEnvironment,
        DATABASE_URL: "postgresql://user:password@localhost:5432/nafah",
      }),
    ).toThrow("DATABASE_URL and SUPABASE_URL must be provided together");
  });
});
