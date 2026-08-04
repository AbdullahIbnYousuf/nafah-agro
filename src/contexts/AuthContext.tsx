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

export type ProfileLoader = (accessToken: string) => Promise<User>;
export type ProfileCompleter = (
  accessToken: string,
) => Promise<User>;
export type ProfileUpdater = (input: { fullName: string; phoneNumber: string }) => Promise<User>;

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, phoneNumber: string, email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updateProfile: (fullName: string, phoneNumber: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  setInitialPassword: (newPassword: string) => Promise<void>;
  needsPasswordSetup: boolean;
  isOwner: boolean;
  isCustomer: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
  client?: SupabaseClient;
  loadProfile?: ProfileLoader;
  completeProfile?: ProfileCompleter;
  saveProfile?: ProfileUpdater;
}

export function AuthProvider({
  children,
  client = supabase,
  loadProfile = getCurrentProfile,
  completeProfile = completeCustomerProfile,
  saveProfile = updateMyProfile,
}: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const resolveSession = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);
    if (!nextSession) {
      setUser(null);
      return;
    }
    try {
      setUser(await loadProfile(nextSession.access_token));
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
          setUser(await loadProfile(nextSession.access_token));
          return;
        } catch {
          await client.auth.signOut();
          setSession(null);
          setUser(null);
          throw new Error('Customer profile setup failed. Please retry registration or contact support.');
        }
      }
      setUser(null);
      await client.auth.signOut();
      throw error;
    }
  }, [client, completeProfile, loadProfile]);

  useEffect(() => {
    let active = true;
    client.auth.getSession().then(async ({ data, error }) => {
      if (!active) return;
      if (error) throw error;
      await resolveSession(data.session);
    }).catch(() => {
      if (active) {
        setSession(null);
        setUser(null);
      }
    }).finally(() => {
      if (active) setLoading(false);
    });

    const { data: { subscription } } = client.auth.onAuthStateChange(
      (_event: AuthChangeEvent, nextSession: Session | null) => {
        if (!active) return;
        void resolveSession(nextSession).catch(() => undefined);
      },
    );

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client, resolveSession]);

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await resolveSession(data.session);
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
    const { error } = await client.auth.signOut();
    if (error) throw error;
    setSession(null);
    setUser(null);
  }, [client]);

  const updateProfile = useCallback(async (fullName: string, phoneNumber: string) => {
    const updated = await saveProfile({ fullName, phoneNumber });
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

  const value = useMemo<AuthContextValue>(() => ({
    user,
    session,
    loading,
    login,
    register,
    logout,
    updateProfile,
    changePassword,
    setInitialPassword,
    needsPasswordSetup: session?.user.user_metadata?.nafah_owner_invite_pending === true,
    isOwner: user?.role === 'OWNER',
    isCustomer: user?.role === 'CUSTOMER',
    isAuthenticated: Boolean(user && session),
  }), [changePassword, loading, login, logout, register, session, setInitialPassword, updateProfile, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
