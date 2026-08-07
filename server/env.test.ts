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
    expect(env.PROTECTED_RATE_LIMIT_MAX).toBe(300);
  });

  it("does not require a frontend URL for same-origin production", () => {
    const env = parseBackendEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:password@localhost:5432/nafah",
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key-with-enough-length",
      CLOUDINARY_CLOUD_NAME: "cloud",
      CLOUDINARY_API_KEY: "key",
      CLOUDINARY_API_SECRET: "secret",
    });

    expect(env.NODE_ENV).toBe("production");
  });

  it("fails fast when production data or image services are missing", () => {
    expect(() => parseBackendEnv({ NODE_ENV: "production" })).toThrow(
      "DATABASE_URL is required in production",
    );
  });

  it("requires owner invitation administration in production", () => {
    expect(() => parseBackendEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:password@localhost:5432/nafah",
      SUPABASE_URL: "https://project.supabase.co",
      CLOUDINARY_CLOUD_NAME: "cloud",
      CLOUDINARY_API_KEY: "key",
      CLOUDINARY_API_SECRET: "secret",
    })).toThrow("SUPABASE_SERVICE_ROLE_KEY is required in production");
  });

  it("requires PostgreSQL and Supabase configuration together", () => {
    expect(() =>
      parseBackendEnv({
        ...validEnvironment,
        DATABASE_URL: "postgresql://user:password@localhost:5432/nafah",
      }),
    ).toThrow("DATABASE_URL and SUPABASE_URL must be provided together");
  });

  it("keeps owner invitations disabled unless the backend-only service key is configured", () => {
    const disabled = parseBackendEnv({
      ...validEnvironment,
      DATABASE_URL: "postgresql://user:password@localhost:5432/nafah",
      SUPABASE_URL: "https://project.supabase.co",
    });
    const enabled = parseBackendEnv({
      ...validEnvironment,
      DATABASE_URL: "postgresql://user:password@localhost:5432/nafah",
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key-with-enough-length",
    });

    expect(disabled.OWNER_INVITATIONS_CONFIGURED).toBe(false);
    expect(enabled.OWNER_INVITATIONS_CONFIGURED).toBe(true);
  });
});
