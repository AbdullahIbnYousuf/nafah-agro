// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { OwnerAuthAdmin } from "../lib/supabaseAdmin.js";
import { createAccountService } from "./accounts.js";

const OWNER_ONE = "10000000-0000-4000-8000-000000000001";
const OWNER_TWO = "10000000-0000-4000-8000-000000000002";
const OWNER_THREE = "10000000-0000-4000-8000-000000000003";

function harness(secondOwner = true) {
  const profiles = [
    { id: OWNER_ONE, role: "OWNER", fullName: "Owner One", phoneNumber: "01700000001", isActive: true, createdAt: new Date("2026-01-01") },
    ...(secondOwner ? [{ id: OWNER_TWO, role: "OWNER", fullName: "Owner Two", phoneNumber: "01700000002", isActive: true, createdAt: new Date("2026-01-02") }] : []),
  ];
  const audits: Array<Record<string, unknown>> = [];
  const profile = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => profiles.find(item => item.id === where.id) ?? null),
    findFirst: vi.fn(async ({ where }: { where: { id: string; role: string } }) => profiles.find(item => item.id === where.id && item.role === where.role) ?? null),
    findMany: vi.fn(async () => [...profiles]),
    count: vi.fn(async () => profiles.filter(item => item.role === "OWNER" && item.isActive).length),
    create: vi.fn(async ({ data }: { data: typeof profiles[number] }) => {
      const created = { ...data, createdAt: new Date("2026-01-03") };
      profiles.push(created); return created;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<typeof profiles[number]> }) => {
      const target = profiles.find(item => item.id === where.id);
      if (!target) throw new Error("missing profile");
      Object.assign(target, data); return { ...target };
    }),
  };
  const database = {
    profile,
    auditLog: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { audits.push(data); return data; }) },
    $transaction: vi.fn(async (operation: (transaction: unknown) => Promise<unknown>) => operation(database)),
  };
  const auth: OwnerAuthAdmin = {
    inviteOwner: vi.fn(async email => ({ id: OWNER_THREE, email, invitedAt: "2026-01-03T00:00:00Z", lastSignInAt: null })),
    getOwner: vi.fn(async id => ({ id, email: `${id}@example.com`, invitedAt: null, lastSignInAt: null })),
    deleteUser: vi.fn(async () => undefined),
  };
  return { profiles, audits, database, auth, service: createAccountService(database as unknown as PrismaClient, auth) };
}

describe("account and owner management service", () => {
  it("updates the authenticated profile and appends an audit record", async () => {
    const { service, audits, profiles } = harness();
    const result = await service.updateOwnProfile(OWNER_ONE, { fullName: "Updated Owner", phoneNumber: "01800000000" });
    expect(result.fullName).toBe("Updated Owner");
    expect(profiles[0].phoneNumber).toBe("01800000000");
    expect(audits[0]).toMatchObject({ action: "PROFILE_UPDATED", entityId: OWNER_ONE });
  });

  it("invites a distinct Supabase identity, creates its OWNER profile, and audits it", async () => {
    const { service, auth, profiles, audits } = harness();
    const result = await service.inviteOwner(OWNER_ONE, {
      fullName: "Owner Three", phoneNumber: "01900000000", email: "owner3@example.com",
    });
    expect(auth.inviteOwner).toHaveBeenCalledWith("owner3@example.com", {
      fullName: "Owner Three", phoneNumber: "01900000000",
    });
    expect(profiles.some(profile => profile.id === OWNER_THREE && profile.role === "OWNER")).toBe(true);
    expect(audits.at(-1)).toMatchObject({ action: "OWNER_INVITED", actorProfileId: OWNER_ONE });
    expect(result.id).toBe(OWNER_THREE);
  });

  it("removes the invited Auth identity if profile creation fails", async () => {
    const { service, auth, database } = harness();
    vi.mocked(database.profile.create).mockRejectedValueOnce(new Error("database failed"));
    await expect(service.inviteOwner(OWNER_ONE, {
      fullName: "Owner Three", phoneNumber: "01900000000", email: "owner3@example.com",
    })).rejects.toThrow("database failed");
    expect(auth.deleteUser).toHaveBeenCalledWith(OWNER_THREE);
  });

  it("blocks self-deactivation and final-owner deactivation", async () => {
    const multiple = harness();
    await expect(multiple.service.setOwnerActive(OWNER_ONE, OWNER_ONE, {
      isActive: false, reason: "Leaving company",
    })).rejects.toMatchObject({ code: "SELF_OWNER_STATUS_CHANGE" });

    const single = harness(false);
    await expect(single.service.setOwnerActive(OWNER_TWO, OWNER_ONE, {
      isActive: false, reason: "Leaving company",
    })).rejects.toMatchObject({ code: "LAST_ACTIVE_OWNER" });
  });

  it("deactivates another owner with a required audited reason", async () => {
    const { service, profiles, audits } = harness();
    const result = await service.setOwnerActive(OWNER_ONE, OWNER_TWO, {
      isActive: false, reason: "No longer works here",
    });
    expect(profiles.find(profile => profile.id === OWNER_TWO)?.isActive).toBe(false);
    expect(audits.at(-1)).toMatchObject({ action: "OWNER_DEACTIVATED", reason: "No longer works here" });
    expect(result.isActive).toBe(false);
  });
});
