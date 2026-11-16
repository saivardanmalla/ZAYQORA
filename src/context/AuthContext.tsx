import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest, getStoredToken, setStoredToken } from '../lib/api';
import type { AuthUser } from '../types/zayqora';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (fullName: string, email: string, password: string, roleCode: 'RESTAURANT_OWNER' | 'CUSTOMER') => Promise<AuthUser>;
  demoLogin: (email: string) => Promise<AuthUser>;
  setSession: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const existingToken = getStoredToken();
    if (!existingToken) {
      setLoading(false);
      return;
    }
    apiRequest<AuthUser>('/api/auth/me')
      .then((me) => {
        setUser(me);
        setToken(existingToken);
      })
      .catch(() => {
        setStoredToken(null);
        setUser(null);
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const setSession = useCallback((nextToken: string, nextUser: AuthUser) => {
    setStoredToken(nextToken);
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiRequest<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setSession(res.token, res.user);
    return res.user;
  }, [setSession]);

  const register = useCallback(
    async (fullName: string, email: string, password: string, roleCode: 'RESTAURANT_OWNER' | 'CUSTOMER') => {
      const res = await apiRequest<{ token: string; user: AuthUser }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ fullName, email, password, roleCode }),
      });
      setSession(res.token, res.user);
      return res.user;
    },
    [setSession]
  );

  const demoLogin = useCallback(
    async (email: string) => {
      const res = await apiRequest<{ token: string; user: AuthUser }>('/api/auth/demo-login', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSession(res.token, res.user);
      return res.user;
    },
    [setSession]
  );

  const logout = useCallback(() => {
    setStoredToken(null);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, demoLogin, setSession, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
