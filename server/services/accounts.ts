import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import type { OwnerAuthAdmin } from "../lib/supabaseAdmin.js";

function accountError(status: number, code: string, message: string) {
  return Object.assign(new Error(message), { status, code });
}

export interface AccountProfile {
  id: string;
  role: "OWNER" | "CUSTOMER";
  fullName: string;
  phoneNumber: string | null;
  isActive: boolean;
}

export interface OwnerAccount extends AccountProfile {
  role: "OWNER";
  email: string | null;
  invitedAt: string | null;
  lastSignInAt: string | null;
  createdAt: Date;
}

export interface AccountService {
  ownerInvitationsConfigured: boolean;
  updateOwnProfile(
    profileId: string,
    input: { fullName: string; phoneNumber: string },
  ): Promise<AccountProfile>;
  listOwners(): Promise<OwnerAccount[]>;
  inviteOwner(
    actorId: string,
    input: { fullName: string; phoneNumber: string; email: string },
  ): Promise<OwnerAccount>;
  setOwnerActive(
    actorId: string,
    ownerId: string,
    input: { isActive: boolean; reason: string },
  ): Promise<OwnerAccount>;
}

function profileSnapshot(profile: { fullName: string; phoneNumber: string | null; isActive: boolean }) {
  return {
    fullName: profile.fullName,
    phoneNumber: profile.phoneNumber,
    isActive: profile.isActive,
  } satisfies Prisma.InputJsonObject;
}

export function createAccountService(
  prisma: PrismaClient,
  ownerAuthAdmin?: OwnerAuthAdmin,
): AccountService {
  async function readOwner(ownerId: string): Promise<OwnerAccount> {
    const profile = await prisma.profile.findFirst({
      where: { id: ownerId, role: "OWNER" },
      select: {
        id: true,
        role: true,
        fullName: true,
        phoneNumber: true,
        isActive: true,
        createdAt: true,
      },
    });
    if (!profile) throw accountError(404, "OWNER_NOT_FOUND", "The owner profile was not found.");
    const identity = ownerAuthAdmin ? await ownerAuthAdmin.getOwner(ownerId) : null;
    return {
      ...profile,
      role: "OWNER",
      email: identity?.email ?? null,
      invitedAt: identity?.invitedAt ?? null,
      lastSignInAt: identity?.lastSignInAt ?? null,
    };
  }

  return {
    ownerInvitationsConfigured: Boolean(ownerAuthAdmin),
    async updateOwnProfile(profileId, input) {
      return prisma.$transaction(async (transaction) => {
        const previous = await transaction.profile.findUnique({
          where: { id: profileId },
          select: { id: true, role: true, fullName: true, phoneNumber: true, isActive: true },
        });
        if (!previous) throw accountError(404, "PROFILE_NOT_FOUND", "The profile was not found.");
        const updated = await transaction.profile.update({
          where: { id: profileId },
          data: { fullName: input.fullName, phoneNumber: input.phoneNumber },
          select: { id: true, role: true, fullName: true, phoneNumber: true, isActive: true },
        });
        await transaction.auditLog.create({ data: {
          actorProfileId: profileId,
          action: "PROFILE_UPDATED",
          entityType: "PROFILE",
          entityId: profileId,
          previousData: profileSnapshot(previous),
          newData: profileSnapshot(updated),
          reason: "Self-service profile update",
        } });
        return updated;
      });
    },

    async listOwners() {
      const profiles = await prisma.profile.findMany({
        where: { role: "OWNER" },
        orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          role: true,
          fullName: true,
          phoneNumber: true,
          isActive: true,
          createdAt: true,
        },
      });
      return Promise.all(profiles.map(async (profile) => {
        const identity = ownerAuthAdmin ? await ownerAuthAdmin.getOwner(profile.id) : null;
        return {
          ...profile,
          role: "OWNER" as const,
          email: identity?.email ?? null,
          invitedAt: identity?.invitedAt ?? null,
          lastSignInAt: identity?.lastSignInAt ?? null,
        };
      }));
    },

    async inviteOwner(actorId, input) {
      if (!ownerAuthAdmin) {
        throw accountError(503, "OWNER_INVITATIONS_NOT_CONFIGURED", "Owner invitations are not configured.");
      }
      const identity = await ownerAuthAdmin.inviteOwner(input.email.toLowerCase(), {
        fullName: input.fullName,
        phoneNumber: input.phoneNumber,
      });
      try {
        await prisma.$transaction(async (transaction) => {
          await transaction.profile.create({ data: {
            id: identity.id,
            role: "OWNER",
            fullName: input.fullName,
            phoneNumber: input.phoneNumber,
            isActive: true,
          } });
          await transaction.auditLog.create({ data: {
            actorProfileId: actorId,
            action: "OWNER_INVITED",
            entityType: "PROFILE",
            entityId: identity.id,
            newData: { fullName: input.fullName, phoneNumber: input.phoneNumber, isActive: true },
            reason: "Owner invitation",
          } });
        });
      } catch (error) {
        try {
          await ownerAuthAdmin.deleteUser(identity.id);
        } catch (cleanupError) {
          console.error("Failed to remove Supabase user after owner profile creation failed", cleanupError);
        }
        throw error;
      }
      return readOwner(identity.id);
    },

    async setOwnerActive(actorId, ownerId, input) {
      if (actorId === ownerId) {
        throw accountError(400, "SELF_OWNER_STATUS_CHANGE", "An owner cannot change their own active status.");
      }
      await prisma.$transaction(async (transaction) => {
        const previous = await transaction.profile.findFirst({
          where: { id: ownerId, role: "OWNER" },
          select: { id: true, fullName: true, phoneNumber: true, isActive: true },
        });
        if (!previous) throw accountError(404, "OWNER_NOT_FOUND", "The owner profile was not found.");
        if (previous.isActive === input.isActive) {
          throw accountError(400, "OWNER_STATUS_UNCHANGED", "The owner already has the requested status.");
        }
        if (!input.isActive) {
          const activeOwners = await transaction.profile.count({ where: { role: "OWNER", isActive: true } });
          if (activeOwners <= 1) {
            throw accountError(409, "LAST_ACTIVE_OWNER", "The final active owner cannot be deactivated.");
          }
        }
        const updated = await transaction.profile.update({
          where: { id: ownerId },
          data: { isActive: input.isActive },
          select: { fullName: true, phoneNumber: true, isActive: true },
        });
        await transaction.auditLog.create({ data: {
          actorProfileId: actorId,
          action: input.isActive ? "OWNER_ACTIVATED" : "OWNER_DEACTIVATED",
          entityType: "PROFILE",
          entityId: ownerId,
          previousData: profileSnapshot(previous),
          newData: profileSnapshot(updated),
          reason: input.reason,
        } });
      }, { isolationLevel: "Serializable" });
      return readOwner(ownerId);
    },
  };
}
