import { z } from "zod";

export const frontendEnvSchema = z
  .object({
    VITE_SUPABASE_URL: z.string().url().optional(),
    VITE_SUPABASE_ANON_KEY: z.string().min(20).optional(),
  })
  .superRefine((env, ctx) => {
    if (Boolean(env.VITE_SUPABASE_URL) !== Boolean(env.VITE_SUPABASE_ANON_KEY)) {
      ctx.addIssue({
        code: "custom",
        path: ["VITE_SUPABASE_URL"],
        message: "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be provided together",
      });
    }
  });

export type FrontendEnv = z.infer<typeof frontendEnvSchema>;

export function parseFrontendEnv(source: Record<string, unknown>): FrontendEnv {
  const parsed = frontendEnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid frontend environment: ${details}`);
  }
  return parsed.data;
}

export const frontendEnv = parseFrontendEnv(import.meta.env);
