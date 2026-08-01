import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().trim().optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());
const optionalPostgresUrl = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .refine(
      (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
      "Must be a PostgreSQL connection URL",
    )
    .optional(),
);

export const backendEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    MONGO_URI: z
      .string()
      .refine(
        (value) => value.startsWith("mongodb://") || value.startsWith("mongodb+srv://"),
        "Must be a MongoDB connection URL",
      ),
    FRONTEND_URL: optionalUrl,
    CLIENT_URL: optionalUrl,
    JSON_BODY_LIMIT: z.string().regex(/^\d+(kb|mb)$/i).default("100kb"),
    RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(86_400_000)
      .default(900_000),
    PROTECTED_RATE_LIMIT_MAX: z.coerce
      .number()
      .int()
      .min(1)
      .max(10_000)
      .default(60),
    CLOUDINARY_CLOUD_NAME: optionalString,
    CLOUDINARY_API_KEY: optionalString,
    CLOUDINARY_API_SECRET: optionalString,
    DATABASE_URL: optionalPostgresUrl,
    DIRECT_URL: optionalPostgresUrl,
    SUPABASE_URL: optionalUrl,
    SUPABASE_JWT_AUDIENCE: z.string().trim().default("authenticated"),
  })
  .superRefine((env, ctx) => {
    if (!env.FRONTEND_URL && !env.CLIENT_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["FRONTEND_URL"],
        message: "FRONTEND_URL is required (CLIENT_URL is accepted temporarily)",
      });
    }

    const cloudinaryValues = [
      env.CLOUDINARY_CLOUD_NAME,
      env.CLOUDINARY_API_KEY,
      env.CLOUDINARY_API_SECRET,
    ];
    const cloudinaryCount = cloudinaryValues.filter(Boolean).length;
    if (cloudinaryCount > 0 && cloudinaryCount < cloudinaryValues.length) {
      ctx.addIssue({
        code: "custom",
        path: ["CLOUDINARY_CLOUD_NAME"],
        message: "Cloudinary variables must be provided together",
      });
    }

    const foundationValues = [env.DATABASE_URL, env.SUPABASE_URL];
    const foundationCount = foundationValues.filter(Boolean).length;
    if (foundationCount > 0 && foundationCount < foundationValues.length) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "DATABASE_URL and SUPABASE_URL must be provided together",
      });
    }
  })
  .transform((env) => ({
    ...env,
    FRONTEND_URL: env.FRONTEND_URL ?? env.CLIENT_URL!,
    FOUNDATION_CONFIGURED: Boolean(env.DATABASE_URL && env.SUPABASE_URL),
  }));

export type BackendEnv = z.infer<typeof backendEnvSchema>;

export function parseBackendEnv(source: NodeJS.ProcessEnv): BackendEnv {
  const parsed = backendEnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid backend environment: ${details}`);
  }
  return parsed.data;
}

let cachedEnv: BackendEnv | undefined;

export function getBackendEnv(): BackendEnv {
  cachedEnv ??= parseBackendEnv(process.env);
  return cachedEnv;
}
