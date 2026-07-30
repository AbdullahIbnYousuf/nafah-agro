import { describe, expect, it } from "vitest";
import { parseFrontendEnv } from "./env";

describe("frontend environment validation", () => {
  it("uses the same-origin API by default", () => {
    expect(parseFrontendEnv({})).toEqual({ VITE_API_URL: "/api" });
  });

  it("accepts a complete public Supabase configuration", () => {
    const env = parseFrontendEnv({
      VITE_API_URL: "https://api.example.com/api",
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_ANON_KEY: "public-anon-key-with-enough-length",
    });

    expect(env.VITE_SUPABASE_URL).toBe("https://project.supabase.co");
  });

  it("rejects a partial public Supabase configuration", () => {
    expect(() =>
      parseFrontendEnv({
        VITE_SUPABASE_URL: "https://project.supabase.co",
      }),
    ).toThrow(
      "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be provided together",
    );
  });
});
