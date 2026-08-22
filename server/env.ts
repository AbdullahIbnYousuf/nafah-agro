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
      .default(300),
    OWNER_INVITE_RATE_LIMIT_MAX: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(5),
    CLOUDINARY_CLOUD_NAME: optionalString,
    CLOUDINARY_API_KEY: optionalString,
    CLOUDINARY_API_SECRET: optionalString,
    DATABASE_URL: optionalPostgresUrl,
    DIRECT_URL: optionalPostgresUrl,
    SUPABASE_URL: optionalUrl,
    SUPABASE_SERVICE_ROLE_KEY: z.preprocess(
      emptyToUndefined,
      z.string().trim().min(20).optional(),
    ),
    SUPABASE_JWT_AUDIENCE: z.string().trim().default("authenticated"),
    VAPID_PUBLIC_KEY: optionalString,
    VAPID_PRIVATE_KEY: optionalString,
    VAPID_SUBJECT: z.preprocess(
      emptyToUndefined,
      z.string().trim().refine(
        (value) => value.startsWith("mailto:") || value.startsWith("https://"),
        "Must be a mailto: or https:// URL",
      ).optional(),
    ),
    CRON_SECRET: z.preprocess(
      emptyToUndefined,
      z.string().trim().min(24).optional(),
    ),
  })
  .superRefine((env, ctx) => {
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

    if (env.SUPABASE_SERVICE_ROLE_KEY && foundationCount < foundationValues.length) {
      ctx.addIssue({
        code: "custom",
        path: ["SUPABASE_SERVICE_ROLE_KEY"],
        message: "Owner invitations require DATABASE_URL and SUPABASE_URL",
      });
    }

    const pushValues = [
      env.VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY,
      env.VAPID_SUBJECT,
      env.CRON_SECRET,
    ];
    const pushCount = pushValues.filter(Boolean).length;
    if (pushCount > 0 && pushCount < pushValues.length) {
      ctx.addIssue({
        code: "custom",
        path: ["VAPID_PUBLIC_KEY"],
        message: "VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, and CRON_SECRET must be provided together",
      });
    }

    if (env.NODE_ENV === "production") {
      const requiredProductionValues = [
        ["DATABASE_URL", env.DATABASE_URL],
        ["SUPABASE_URL", env.SUPABASE_URL],
        ["SUPABASE_SERVICE_ROLE_KEY", env.SUPABASE_SERVICE_ROLE_KEY],
        ["CLOUDINARY_CLOUD_NAME", env.CLOUDINARY_CLOUD_NAME],
        ["CLOUDINARY_API_KEY", env.CLOUDINARY_API_KEY],
        ["CLOUDINARY_API_SECRET", env.CLOUDINARY_API_SECRET],
        ["VAPID_PUBLIC_KEY", env.VAPID_PUBLIC_KEY],
        ["VAPID_PRIVATE_KEY", env.VAPID_PRIVATE_KEY],
        ["VAPID_SUBJECT", env.VAPID_SUBJECT],
        ["CRON_SECRET", env.CRON_SECRET],
      ] as const;
      for (const [name, value] of requiredProductionValues) {
        if (!value) {
          ctx.addIssue({
            code: "custom",
            path: [name],
            message: `${name} is required in production`,
          });
        }
      }
    }
  })
  .transform((env) => ({
    ...env,
    FOUNDATION_CONFIGURED: Boolean(env.DATABASE_URL && env.SUPABASE_URL),
    OWNER_INVITATIONS_CONFIGURED: Boolean(
      env.DATABASE_URL && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    PUSH_CONFIGURED: Boolean(
      env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT && env.CRON_SECRET,
    ),
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
