import { describe, expect, it } from "vitest";
import { parseFrontendEnv } from "./env";

describe("frontend environment validation", () => {
  it("accepts an empty public configuration for isolated tests", () => {
    expect(parseFrontendEnv({})).toEqual({});
  });

  it("accepts a complete public Supabase configuration", () => {
    const env = parseFrontendEnv({
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
