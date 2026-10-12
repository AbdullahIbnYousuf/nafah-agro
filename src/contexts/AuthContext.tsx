import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@/lib/types';
import { ApiError, completeCustomerProfile, getCurrentProfile, updateMyProfile } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { disablePushNotifications } from '@/lib/pushNotifications';

export type ProfileLoader = (accessToken: string) => Promise<User>;
export type ProfileCompleter = (
  accessToken: string,
) => Promise<User>;
export type ProfileUpdater = (input: { fullName: string; phoneNumber: string | null; deliveryAddress?: string | null; preferredDeliveryRateId?: string | null }) => Promise<User>;
export type PushLogoutCleanup = () => Promise<unknown>;

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  sessionError: string | null;
  retrySession: () => Promise<void>;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, phoneNumber: string, email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updateProfile: (fullName: string, phoneNumber: string | null, delivery?: { deliveryAddress: string | null; preferredDeliveryRateId: string | null }) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  setInitialPassword: (newPassword: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  completePasswordRecovery: (newPassword: string) => Promise<void>;
  isPasswordRecovery: boolean;
  needsPasswordSetup: boolean;
  isOwner: boolean;
  isCustomer: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const PASSWORD_RECOVERY_STORAGE_KEY = 'nafah-agro-password-recovery';

function isPasswordRecoveryRoute() {
  return typeof window !== 'undefined' && window.location.pathname === '/reset-password';
}

function hasPasswordRecoveryMarker() {
  return typeof window !== 'undefined'
    && window.sessionStorage.getItem(PASSWORD_RECOVERY_STORAGE_KEY) === 'true';
}

function setPasswordRecoveryMarker(active: boolean) {
  if (typeof window === 'undefined') return;
  if (active) {
    window.sessionStorage.setItem(PASSWORD_RECOVERY_STORAGE_KEY, 'true');
  } else {
    window.sessionStorage.removeItem(PASSWORD_RECOVERY_STORAGE_KEY);
  }
}

interface AuthProviderProps {
  children: ReactNode;
  client?: SupabaseClient;
  loadProfile?: ProfileLoader;
  completeProfile?: ProfileCompleter;
  saveProfile?: ProfileUpdater;
  cleanupPushOnLogout?: PushLogoutCleanup;
}

export function AuthProvider({
  children,
  client = supabase,
  loadProfile = getCurrentProfile,
  completeProfile = completeCustomerProfile,
  saveProfile = updateMyProfile,
  cleanupPushOnLogout = disablePushNotifications,
}: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  const resolveSession = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);
    setSessionError(null);
    if (!nextSession) {
      setUser(null);
      return null;
    }
    try {
      const profile = await loadProfile(nextSession.access_token);
      setUser(profile);
      return profile;
    } catch (error) {
      const metadata = nextSession.user.user_metadata ?? {};
      const fullName = typeof metadata.full_name === 'string' ? metadata.full_name.trim() : '';
      const phoneNumber = typeof metadata.phone_number === 'string' ? metadata.phone_number.trim() : '';
      if (
        error instanceof ApiError
        && error.code === 'PROFILE_REQUIRED'
        && fullName
        && phoneNumber.length >= 7
      ) {
        try {
          await completeProfile(nextSession.access_token);
          const profile = await loadProfile(nextSession.access_token);
          setUser(profile);
          return profile;
        } catch {
          await client.auth.signOut();
          setSession(null);
          setUser(null);
          throw new Error('Customer profile setup failed. Please retry registration or contact support.');
        }
      }
      setUser(null);
      const permanentProfileFailure = error instanceof ApiError
        && (error.status === 401
          || error.status === 403
          || error.code === 'PROFILE_REQUIRED'
          || error.code === 'PROFILE_INACTIVE');
      if (permanentProfileFailure) {
        await client.auth.signOut();
        setSession(null);
      } else {
        setSessionError(error instanceof ApiError && error.code === 'REQUEST_TIMEOUT'
          ? 'অ্যাকাউন্টের তথ্য লোড হতে বেশি সময় লাগছে। রিট্রাই করুন।'
          : 'অ্যাকাউন্টের তথ্য লোড করা যায়নি। ইন্টারনেট কানেকশন দেখে রিট্রাই করুন।');
      }
      throw error;
    }
  }, [client, completeProfile, loadProfile]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data, error } = await client.auth.getSession();
        if (!active) return;
        if (error) {
          setSession(null);
          setUser(null);
          setSessionError('অ্যাকাউন্টের সেশন লোড করা যায়নি। আবার লগইন করুন।');
          return;
        }
        if (isPasswordRecoveryRoute()) {
          setSession(data.session);
          setUser(null);
          setIsPasswordRecovery(Boolean(data.session && hasPasswordRecoveryMarker()));
          return;
        }
        setPasswordRecoveryMarker(false);
        setIsPasswordRecovery(false);
        try {
          await resolveSession(data.session);
        } catch {
          // resolveSession already distinguishes permanent and temporary failures.
        }
      } catch {
        if (active) {
          setSession(null);
          setUser(null);
          setSessionError('অ্যাকাউন্টের সেশন লোড করা যায়নি। আবার লগইন করুন।');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    const { data: { subscription } } = client.auth.onAuthStateChange(
      (event: AuthChangeEvent, nextSession: Session | null) => {
        if (!active) return;
        if (event === 'PASSWORD_RECOVERY') {
          setPasswordRecoveryMarker(Boolean(nextSession));
          setIsPasswordRecovery(Boolean(nextSession));
          setSession(nextSession);
          setUser(null);
          setLoading(false);
          return;
        }
        if (event === 'SIGNED_OUT') {
          setPasswordRecoveryMarker(false);
          setIsPasswordRecovery(false);
        }
        if (isPasswordRecoveryRoute()) {
          setSession(nextSession);
          setUser(null);
          return;
        }
        setPasswordRecoveryMarker(false);
        setIsPasswordRecovery(false);
        void resolveSession(nextSession).catch(() => undefined);
      },
    );

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client, resolveSession]);

  const retrySession = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      await resolveSession(session);
    } catch {
      // resolveSession keeps a temporary failure visible and preserves the session.
    } finally {
      setLoading(false);
    }
  }, [resolveSession, session]);

  const login = useCallback(async (email: string, password: string) => {
    setPasswordRecoveryMarker(false);
    setIsPasswordRecovery(false);
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const profile = await resolveSession(data.session);
    if (!profile) throw new Error('Login did not create an authenticated session.');
    return profile;
  }, [client, resolveSession]);

  const register = useCallback(async (
    name: string,
    phoneNumber: string,
    email: string,
    password: string,
  ) => {
    if (phoneNumber.trim().length < 7) {
      throw new Error('A valid phone number is required.');
    }
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          phone_number: phoneNumber.trim(),
          nafah_role: 'CUSTOMER',
        },
      },
    });
    if (error) {
      if (/database|saving new user/i.test(error.message)) {
        throw new Error('Account setup failed and no usable profile was created. Please try again.');
      }
      throw error;
    }
    if (data.session) await resolveSession(data.session);
    return !data.session;
  }, [client, resolveSession]);

  const logout = useCallback(async () => {
    if (user?.role === 'OWNER') {
      await cleanupPushOnLogout().catch(() => undefined);
    }
    const { error } = await client.auth.signOut();
    if (error) throw error;
    setPasswordRecoveryMarker(false);
    setIsPasswordRecovery(false);
    setSession(null);
    setUser(null);
  }, [cleanupPushOnLogout, client, user?.role]);

  const updateProfile = useCallback(async (fullName: string, phoneNumber: string | null, delivery?: { deliveryAddress: string | null; preferredDeliveryRateId: string | null }) => {
    const updated = await saveProfile({ fullName, phoneNumber, ...delivery });
    setUser(updated);
  }, [saveProfile]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    if (!user?.email) throw new Error('This account does not have an email address.');
    const { error: verificationError } = await client.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (verificationError) throw new Error('Current password is incorrect.');
    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }, [client, user?.email]);

  const setInitialPassword = useCallback(async (newPassword: string) => {
    const { data, error } = await client.auth.updateUser({
      password: newPassword,
      data: { nafah_owner_invite_pending: false },
    });
    if (error) throw error;
    if (data.user) {
      setSession(current => current ? { ...current, user: data.user } : current);
    }
  }, [client]);

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  }, [client]);

  const completePasswordRecovery = useCallback(async (newPassword: string) => {
    if (!session || !isPasswordRecovery) {
      throw new Error('This password recovery link is invalid or has expired.');
    }
    const { error } = await client.auth.updateUser({
      password: newPassword,
      data: { nafah_owner_invite_pending: false },
    });
    if (error) throw error;
    const { error: signOutError } = await client.auth.signOut();
    if (signOutError) throw signOutError;
    setPasswordRecoveryMarker(false);
    setIsPasswordRecovery(false);
    setSession(null);
    setUser(null);
  }, [client, isPasswordRecovery, session]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    session,
    loading,
    sessionError,
    retrySession,
    login,
    register,
    logout,
    updateProfile,
    changePassword,
    setInitialPassword,
    requestPasswordReset,
    completePasswordRecovery,
    isPasswordRecovery,
    needsPasswordSetup: session?.user.user_metadata?.nafah_owner_invite_pending === true,
    isOwner: user?.role === 'OWNER',
    isCustomer: user?.role === 'CUSTOMER',
    isAuthenticated: Boolean(user && session),
  }), [changePassword, completePasswordRecovery, isPasswordRecovery, loading, login, logout, register, requestPasswordReset, retrySession, session, sessionError, setInitialPassword, updateProfile, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
