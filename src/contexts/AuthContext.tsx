import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { User } from '@/lib/types';
import {
  loginUser as apiLogin,
  registerUser as apiRegister,
  getCurrentUser,
  getStoredToken,
  setStoredToken,
  removeStoredToken,
} from '@/lib/api';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  setAuthData: (token: string, user: User) => void;
  isAdmin: boolean;
  isModerator: boolean;
  isCustomer: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [loading, setLoading] = useState(true);

  // On mount, validate existing token
  useEffect(() => {
    const existingToken = getStoredToken();
    if (existingToken) {
      getCurrentUser()
        .then((u) => {
          setUser(u);
          setToken(existingToken);
        })
        .catch(() => {
          removeStoredToken();
          setToken(null);
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const setAuthData = useCallback((newToken: string, newUser: User) => {
    setStoredToken(newToken);
    setToken(newToken);
    setUser(newUser);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    setAuthData(res.token, res.user);
  }, [setAuthData]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const res = await apiRegister(name, email, password);
    setAuthData(res.token, res.user);
  }, [setAuthData]);

  const logout = useCallback(() => {
    removeStoredToken();
    setToken(null);
    setUser(null);
  }, []);

  const value: AuthContextValue = {
    user,
    token,
    loading,
    login,
    register,
    logout,
    setAuthData,
    isAdmin: user?.role === 'admin',
    isModerator: user?.role === 'moderator',
    isCustomer: user?.role === 'customer',
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
