import { createContext, useCallback, useEffect, useMemo, useState, ReactNode } from 'react';
import type { AuthUser } from '../types';
import { getMe, login as apiLogin, logout as apiLogout } from '../lib/api';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  /** Re-reads the profile — used after a forced password change clears the gate. */
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // The browser sends the HttpOnly session cookie when one exists.
  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user: authUser } = await apiLogin(email, password);
    setUser(authUser);
    return authUser;
  }, []);

  const refresh = useCallback(async () => {
    setUser(await getMe());
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: !!user, loading, login, logout, refresh }),
    [user, loading, login, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
