import { createClient } from "@supabase/supabase-js";

export interface OwnerAuthIdentity {
  id: string;
  email: string | null;
  invitedAt: string | null;
  lastSignInAt: string | null;
}

export interface OwnerAuthAdmin {
  inviteOwner(
    email: string,
    metadata: { fullName: string; phoneNumber: string },
  ): Promise<OwnerAuthIdentity>;
  getOwner(userId: string): Promise<OwnerAuthIdentity | null>;
  deleteUser(userId: string): Promise<void>;
}

export function createOwnerAuthAdmin(
  supabaseUrl: string,
  serviceRoleKey: string,
): OwnerAuthAdmin {
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return {
    async inviteOwner(email, metadata) {
      const { data, error } = await client.auth.admin.inviteUserByEmail(email, {
        data: {
          full_name: metadata.fullName,
          phone_number: metadata.phoneNumber,
          nafah_owner_invite_pending: true,
        },
      });
      if (error || !data.user) {
        const duplicate = error?.status === 422 || /already|registered|exists/i.test(error?.message ?? "");
        const invitationError = Object.assign(
          new Error(error?.message ?? "Supabase did not create an invited user."),
          { status: duplicate ? 409 : 502, code: duplicate ? "OWNER_EMAIL_EXISTS" : "OWNER_INVITE_FAILED" },
        );
        throw invitationError;
      }
      return {
        id: data.user.id,
        email: data.user.email ?? null,
        invitedAt: data.user.invited_at ?? null,
        lastSignInAt: data.user.last_sign_in_at ?? null,
      };
    },

    async getOwner(userId) {
      const { data, error } = await client.auth.admin.getUserById(userId);
      if (error) return null;
      return {
        id: data.user.id,
        email: data.user.email ?? null,
        invitedAt: data.user.invited_at ?? null,
        lastSignInAt: data.user.last_sign_in_at ?? null,
      };
    },

    async deleteUser(userId) {
      const { error } = await client.auth.admin.deleteUser(userId);
      if (error) throw error;
    },
  };
}
