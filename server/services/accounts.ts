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
  canDelete: boolean;
}

export interface AccountService {
  ownerInvitationsConfigured: boolean;
  updateOwnProfile(
    profileId: string,
    input: { fullName: string; phoneNumber: string },
  ): Promise<AccountProfile>;
  listOwners(actorId: string): Promise<OwnerAccount[]>;
  inviteOwner(
    actorId: string,
    input: { fullName: string; phoneNumber: string; email: string },
  ): Promise<OwnerAccount>;
  setOwnerActive(
    actorId: string,
    ownerId: string,
    input: { isActive: boolean; reason: string },
  ): Promise<OwnerAccount>;
  deleteUnusedOwner(
    actorId: string,
    ownerId: string,
  ): Promise<{ id: string }>;
}

function profileSnapshot(profile: { fullName: string; phoneNumber: string | null; isActive: boolean }) {
  return {
    fullName: profile.fullName,
    phoneNumber: profile.phoneNumber,
    isActive: profile.isActive,
  } satisfies Prisma.InputJsonObject;
}

const ownerHistoryCountSelect = {
  priceChanges: true,
  stockBatches: true,
  stockAdjustments: true,
  createdSales: true,
  customerSales: true,
  unprofitableOverrides: true,
  updatedDeliveryRates: true,
  auditLogs: true,
} as const;

function hasOwnerHistory(counts: Record<keyof typeof ownerHistoryCountSelect, number>) {
  return Object.values(counts).some((count) => count > 0);
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
        _count: { select: ownerHistoryCountSelect },
      },
    });
    if (!profile) throw accountError(404, "OWNER_NOT_FOUND", "The owner profile was not found.");
    const identity = ownerAuthAdmin ? await ownerAuthAdmin.getOwner(ownerId) : null;
    return {
      id: profile.id,
      fullName: profile.fullName,
      phoneNumber: profile.phoneNumber,
      isActive: profile.isActive,
      createdAt: profile.createdAt,
      role: "OWNER",
      email: identity?.email ?? null,
      invitedAt: identity?.invitedAt ?? null,
      lastSignInAt: identity?.lastSignInAt ?? null,
      canDelete: Boolean(identity) && !hasOwnerHistory(profile._count),
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

    async listOwners(actorId) {
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
          _count: { select: ownerHistoryCountSelect },
        },
      });
      return Promise.all(profiles.map(async (profile) => {
        const identity = ownerAuthAdmin ? await ownerAuthAdmin.getOwner(profile.id) : null;
        return {
          id: profile.id,
          fullName: profile.fullName,
          phoneNumber: profile.phoneNumber,
          isActive: profile.isActive,
          createdAt: profile.createdAt,
          role: "OWNER" as const,
          email: identity?.email ?? null,
          invitedAt: identity?.invitedAt ?? null,
          lastSignInAt: identity?.lastSignInAt ?? null,
          canDelete: profile.id !== actorId && Boolean(identity) && !hasOwnerHistory(profile._count),
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

    async deleteUnusedOwner(actorId, ownerId) {
      if (!ownerAuthAdmin) {
        throw accountError(503, "OWNER_INVITATIONS_NOT_CONFIGURED", "Owner invitations are not configured.");
      }
      if (actorId === ownerId) {
        throw accountError(400, "SELF_OWNER_DELETE", "An owner cannot delete their own account.");
      }

      const owner = await prisma.profile.findFirst({
        where: { id: ownerId, role: "OWNER" },
        select: {
          id: true,
          fullName: true,
          phoneNumber: true,
          isActive: true,
          _count: {
            select: ownerHistoryCountSelect,
          },
        },
      });
      if (!owner) throw accountError(404, "OWNER_NOT_FOUND", "The owner profile was not found.");

      const identity = await ownerAuthAdmin.getOwner(ownerId);
      if (!identity) {
        throw accountError(409, "OWNER_AUTH_IDENTITY_NOT_FOUND", "The invited Auth identity was not found.");
      }
      if (hasOwnerHistory(owner._count)) {
        throw accountError(409, "OWNER_HAS_BUSINESS_HISTORY", "This owner has business history and can only be deactivated.");
      }

      const deletionSnapshot = {
        ...profileSnapshot(owner),
        authUserId: identity.id,
        ...(identity.email ? { email: identity.email } : {}),
        ...(identity.invitedAt ? { invitedAt: identity.invitedAt } : {}),
        ...(identity.lastSignInAt ? { lastSignInAt: identity.lastSignInAt } : {}),
      } satisfies Prisma.InputJsonObject;

      await prisma.auditLog.create({ data: {
        actorProfileId: actorId,
        action: "OWNER_DELETE_REQUESTED",
        entityType: "PROFILE",
        entityId: ownerId,
        previousData: deletionSnapshot,
        reason: "Unused owner account removal",
      } });
      try {
        await ownerAuthAdmin.deleteUser(ownerId);
      } catch {
        throw accountError(502, "OWNER_DELETE_FAILED", "The unused owner account could not be deleted from authentication.");
      }
      try {
        await prisma.auditLog.create({ data: {
          actorProfileId: actorId,
          action: "OWNER_DELETED",
          entityType: "PROFILE",
          entityId: ownerId,
          previousData: deletionSnapshot,
          reason: "Unused owner account removal",
        } });
      } catch {
        // Supabase Auth deletion is already complete at this point. The durable
        // pre-delete audit contains the full snapshot, so do not report a false
        // failure or encourage a retry against an account that no longer exists.
        console.error("Owner account was deleted, but the completion audit could not be recorded.");
      }
      return { id: ownerId };
    },
  };
}
