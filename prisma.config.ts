import "dotenv/config";
import { defineConfig } from "prisma/config";

// `prisma generate` does not connect to this URL. The non-secret local value
// keeps fresh installs deterministic; runtime validation still requires real
// DATABASE_URL credentials before any PostgreSQL query can run.
const cliDatabaseUrl =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL ??
  "postgresql://prisma:prisma@127.0.0.1:5432/nafah_agro";

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
