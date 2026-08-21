import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import type { OwnerAuthAdmin } from "../lib/supabaseAdmin.js";

function accountError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return Object.assign(new Error(message), { status, code, ...(details ? { details } : {}) });
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
  promotedFromCustomer: boolean;
  canDemote: boolean;
  demotionBlockedReason: "SELF" | "INACTIVE" | "LAST_ACTIVE_OWNER" | "OWNER_HISTORY" | null;
}

export interface CustomerPromotionCandidate extends AccountProfile {
  role: "CUSTOMER";
  email: string;
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
  promoteCustomer(
    actorId: string,
    input: { customerProfileId: string; reason: string },
  ): Promise<OwnerAccount>;
  demotePromotedOwner(
    actorId: string,
    ownerId: string,
    input: { reason: string },
  ): Promise<AccountProfile>;
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

function roleSnapshot(profile: {
  role: "OWNER" | "CUSTOMER";
  fullName: string;
  phoneNumber: string | null;
  isActive: boolean;
}) {
  return { ...profileSnapshot(profile), role: profile.role } satisfies Prisma.InputJsonObject;
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
  physicalSaleReturns: true,
} as const;

function hasOwnerHistory(counts: Record<keyof typeof ownerHistoryCountSelect, number>) {
  return Object.values(counts).some((count) => count > 0);
}

function hasOwnerOperationalHistory(counts: Record<keyof typeof ownerHistoryCountSelect, number>) {
  return counts.priceChanges > 0
    || counts.stockBatches > 0
    || counts.stockAdjustments > 0
    || counts.createdSales > 0
    || counts.unprofitableOverrides > 0
    || counts.updatedDeliveryRates > 0
    || counts.physicalSaleReturns > 0;
}

function isTransactionConflict(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2034");
}

export function createAccountService(
  prisma: PrismaClient,
  ownerAuthAdmin?: OwnerAuthAdmin,
): AccountService {
  async function getDemotionState(
    profile: {
      id: string;
      isActive: boolean;
      _count: Record<keyof typeof ownerHistoryCountSelect, number>;
    },
    actorId: string,
    activeOwnerCount: number,
  ) {
    const promotion = await prisma.auditLog.findFirst({
      where: {
        action: "CUSTOMER_PROMOTED_TO_OWNER",
        entityType: "PROFILE",
        entityId: profile.id,
      },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    if (!promotion) {
      return { promotedFromCustomer: false, canDemote: false, demotionBlockedReason: null } as const;
    }
    if (profile.id === actorId) {
      return { promotedFromCustomer: true, canDemote: false, demotionBlockedReason: "SELF" } as const;
    }
    if (!profile.isActive) {
      return { promotedFromCustomer: true, canDemote: false, demotionBlockedReason: "INACTIVE" } as const;
    }
    if (activeOwnerCount <= 1) {
      return { promotedFromCustomer: true, canDemote: false, demotionBlockedReason: "LAST_ACTIVE_OWNER" } as const;
    }
    const blockingAuditCount = await prisma.auditLog.count({
      where: {
        actorProfileId: profile.id,
        createdAt: { gte: promotion.createdAt },
        action: { notIn: ["PROFILE_UPDATED", "WEBSITE_ORDER_CREATED"] },
      },
    });
    if (hasOwnerOperationalHistory(profile._count) || blockingAuditCount > 0) {
      return { promotedFromCustomer: true, canDemote: false, demotionBlockedReason: "OWNER_HISTORY" } as const;
    }
    return { promotedFromCustomer: true, canDemote: true, demotionBlockedReason: null } as const;
  }

  async function readOwner(ownerId: string, actorId: string): Promise<OwnerAccount> {
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
    const [identity, activeOwnerCount] = await Promise.all([
      ownerAuthAdmin ? ownerAuthAdmin.getOwner(ownerId) : Promise.resolve(null),
      prisma.profile.count({ where: { role: "OWNER", isActive: true } }),
    ]);
    const demotionState = await getDemotionState(profile, actorId, activeOwnerCount);
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
      canDelete: profile.id !== actorId
        && !demotionState.promotedFromCustomer
        && Boolean(identity)
        && !hasOwnerHistory(profile._count),
      ...demotionState,
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
      const [profiles, activeOwnerCount] = await Promise.all([prisma.profile.findMany({
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
      }), prisma.profile.count({ where: { role: "OWNER", isActive: true } })]);
      return Promise.all(profiles.map(async (profile) => {
        const [identity, demotionState] = await Promise.all([
          ownerAuthAdmin ? ownerAuthAdmin.getOwner(profile.id) : Promise.resolve(null),
          getDemotionState(profile, actorId, activeOwnerCount),
        ]);
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
          canDelete: profile.id !== actorId
            && !demotionState.promotedFromCustomer
            && Boolean(identity)
            && !hasOwnerHistory(profile._count),
          ...demotionState,
        };
      }));
    },

    async inviteOwner(actorId, input) {
      if (!ownerAuthAdmin) {
        throw accountError(503, "OWNER_INVITATIONS_NOT_CONFIGURED", "Owner invitations are not configured.");
      }
      const normalizedEmail = input.email.trim().toLowerCase();
      const existingIdentity = await ownerAuthAdmin.findUserByEmail(normalizedEmail);
      if (existingIdentity) {
        const existingProfile = await prisma.profile.findUnique({
          where: { id: existingIdentity.id },
          select: { id: true, role: true, fullName: true, phoneNumber: true, isActive: true },
        });
        if (!existingProfile) {
          throw accountError(
            409,
            "AUTH_IDENTITY_PROFILE_MISSING",
            "This login exists but its application profile is missing. Contact support before changing the account.",
          );
        }
        if (existingProfile.role === "OWNER") {
          throw accountError(409, "OWNER_EMAIL_EXISTS", "An owner account already uses this email address.");
        }
        throw accountError(
          409,
          "CUSTOMER_EMAIL_EXISTS",
          "A customer account already uses this email address and can be promoted.",
          {
            customerProfileId: existingProfile.id,
            fullName: existingProfile.fullName,
            phoneNumber: existingProfile.phoneNumber,
            email: existingIdentity.email ?? normalizedEmail,
            isActive: existingProfile.isActive,
          },
        );
      }
      const identity = await ownerAuthAdmin.inviteOwner(normalizedEmail, {
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
      return readOwner(identity.id, actorId);
    },

    async promoteCustomer(actorId, input) {
      try {
        await prisma.$transaction(async (transaction) => {
          const previous = await transaction.profile.findUnique({
            where: { id: input.customerProfileId },
            select: { id: true, role: true, fullName: true, phoneNumber: true, isActive: true },
          });
          if (!previous) throw accountError(404, "CUSTOMER_NOT_FOUND", "The customer profile was not found.");
          if (previous.role !== "CUSTOMER") {
            throw accountError(409, "CUSTOMER_ROLE_CHANGED", "This account is no longer a customer. Refresh the owner list and try again.");
          }
          const changed = await transaction.profile.updateMany({
            where: { id: previous.id, role: "CUSTOMER" },
            data: { role: "OWNER" },
          });
          if (changed.count !== 1) {
            throw accountError(409, "CUSTOMER_ROLE_CHANGED", "This account role changed before the promotion completed.");
          }
          await transaction.auditLog.create({ data: {
            actorProfileId: actorId,
            action: "CUSTOMER_PROMOTED_TO_OWNER",
            entityType: "PROFILE",
            entityId: previous.id,
            previousData: roleSnapshot(previous),
            newData: roleSnapshot({ ...previous, role: "OWNER" }),
            reason: input.reason,
          } });
        }, { isolationLevel: "Serializable" });
      } catch (error) {
        if (isTransactionConflict(error)) {
          throw accountError(409, "CUSTOMER_ROLE_CHANGED", "Another role change completed first. Refresh and try again.");
        }
        throw error;
      }
      return readOwner(input.customerProfileId, actorId);
    },

    async demotePromotedOwner(actorId, ownerId, input) {
      if (actorId === ownerId) {
        throw accountError(400, "SELF_OWNER_DEMOTION", "An owner cannot demote their own account.");
      }
      try {
        return await prisma.$transaction(async (transaction) => {
        const owner = await transaction.profile.findFirst({
          where: { id: ownerId, role: "OWNER" },
          select: {
            id: true,
            role: true,
            fullName: true,
            phoneNumber: true,
            isActive: true,
            _count: { select: ownerHistoryCountSelect },
          },
        });
        if (!owner) throw accountError(404, "OWNER_NOT_FOUND", "The owner profile was not found.");
        if (!owner.isActive) {
          throw accountError(409, "INACTIVE_OWNER_DEMOTION", "Reactivate this owner before changing the account back to customer.");
        }
        const activeOwnerCount = await transaction.profile.count({ where: { role: "OWNER", isActive: true } });
        if (activeOwnerCount <= 1) {
          throw accountError(409, "LAST_ACTIVE_OWNER", "The final active owner cannot be changed to a customer.");
        }
        const promotion = await transaction.auditLog.findFirst({
          where: {
            action: "CUSTOMER_PROMOTED_TO_OWNER",
            entityType: "PROFILE",
            entityId: ownerId,
          },
          select: { createdAt: true },
          orderBy: { createdAt: "desc" },
        });
        if (!promotion) {
          throw accountError(409, "OWNER_NOT_PROMOTED_CUSTOMER", "Only an owner previously promoted from a customer can be changed back.");
        }
        const blockingAuditCount = await transaction.auditLog.count({
          where: {
            actorProfileId: ownerId,
            createdAt: { gte: promotion.createdAt },
            action: { notIn: ["PROFILE_UPDATED", "WEBSITE_ORDER_CREATED"] },
          },
        });
        if (hasOwnerOperationalHistory(owner._count) || blockingAuditCount > 0) {
          throw accountError(409, "OWNER_HAS_OPERATIONAL_HISTORY", "This owner has management activity and can no longer be changed back to a customer.");
        }
        const changed = await transaction.profile.updateMany({
          where: { id: ownerId, role: "OWNER", isActive: true },
          data: { role: "CUSTOMER" },
        });
        if (changed.count !== 1) {
          throw accountError(409, "OWNER_ROLE_CHANGED", "This account role changed before the demotion completed.");
        }
        const updated = { ...owner, role: "CUSTOMER" as const };
        await transaction.auditLog.create({ data: {
          actorProfileId: actorId,
          action: "OWNER_DEMOTED_TO_CUSTOMER",
          entityType: "PROFILE",
          entityId: ownerId,
          previousData: roleSnapshot(owner),
          newData: roleSnapshot(updated),
          reason: input.reason,
        } });
        return {
          id: updated.id,
          role: updated.role,
          fullName: updated.fullName,
          phoneNumber: updated.phoneNumber,
          isActive: updated.isActive,
        };
        }, { isolationLevel: "Serializable" });
      } catch (error) {
        if (isTransactionConflict(error)) {
          throw accountError(409, "OWNER_ROLE_CHANGED", "Another role change completed first. Refresh and try again.");
        }
        throw error;
      }
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
      return readOwner(ownerId, actorId);
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

      const promotion = await prisma.auditLog.findFirst({
        where: {
          action: "CUSTOMER_PROMOTED_TO_OWNER",
          entityType: "PROFILE",
          entityId: ownerId,
        },
        select: { id: true },
        orderBy: { createdAt: "desc" },
      });
      if (promotion) {
        throw accountError(
          409,
          "PROMOTED_OWNER_REQUIRES_DEMOTION",
          "This account came from a customer and must be changed back to customer instead of deleted.",
        );
      }

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
