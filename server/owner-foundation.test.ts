// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(
  new URL("../prisma/schema.prisma", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "../prisma/migrations/202608010001_multiple_owners/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const ownerCommand = readFileSync(
  new URL("../prisma/create-initial-owner.ts", import.meta.url),
  "utf8",
);

describe("two-role and multiple-owner foundation", () => {
  it("defines only OWNER and CUSTOMER in the current Prisma role enum", () => {
    const roleEnum = schema.match(/enum Role \{([\s\S]*?)\}/)?.[1];

    expect(roleEnum).toBeDefined();
    expect(roleEnum).toContain("OWNER");
    expect(roleEnum).toContain("CUSTOMER");
    expect(roleEnum).not.toContain("ADMIN");
  });

  it("removes the one-owner index and rejects unresolved historical admins", () => {
    expect(migration).toContain('DROP INDEX IF EXISTS "profiles_single_owner_key"');
    expect(migration).toContain("CREATE TYPE public.\"Role\" AS ENUM ('OWNER', 'CUSTOMER')");
    expect(migration).toContain("Resolve existing ADMIN profiles");
  });

  it("protects the final active owner in the database", () => {
    expect(migration).toContain("profiles_last_active_owner_guard");
    expect(migration).toContain("At least one active OWNER profile is required");
    expect(migration).toContain("BEFORE UPDATE OF role, is_active OR DELETE");
  });

  it("allows the controlled command to create another owner identity", () => {
    expect(ownerCommand).not.toContain("existingOwner");
    expect(ownerCommand).not.toContain("An OWNER profile already exists");
    expect(ownerCommand).toContain('role: "OWNER"');
    expect(ownerCommand).toContain("existingProfile");
  });
});
