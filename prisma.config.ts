import "dotenv/config";
import { defineConfig } from "prisma/config";

// `prisma generate` does not connect to this URL. The non-secret local value
// keeps fresh installs deterministic; runtime validation still requires real
// DATABASE_URL credentials before any PostgreSQL query can run.
const configuredDatabaseUrl =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL ??
  "postgresql://prisma:prisma@127.0.0.1:5432/nafah_agro";

function prismaCliDatabaseUrl(connectionString: string) {
  const url = new URL(connectionString);
  if (url.hostname.endsWith(".supabase.com")) {
    url.searchParams.set("sslmode", "require");
    if (!url.searchParams.has("connect_timeout")) {
      url.searchParams.set("connect_timeout", "30");
    }
  }
  return url.toString();
}

const cliDatabaseUrl = prismaCliDatabaseUrl(configuredDatabaseUrl);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: cliDatabaseUrl,
  },
});
