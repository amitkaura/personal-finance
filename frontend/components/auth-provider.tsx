"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@/lib/types";
import { api } from "@/lib/api";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  clearSession: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
  refreshUser: async () => {},
  clearSession: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    api
      .getMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (idToken: string) => {
    const u = await api.loginWithGoogle(idToken);
    queryClient.clear();
    setUser(u);
  }, [queryClient]);

  const logout = useCallback(async () => {
    await api.logout();
    queryClient.clear();
    setUser(null);
  }, [queryClient]);

  const clearSession = useCallback(() => {
    queryClient.clear();
    setUser(null);
  }, [queryClient]);

  const refreshUser = useCallback(async () => {
    try {
      const u = await api.getMe();
      setUser(u);
    } catch {
      /* keep current user on transient failure */
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refreshUser, clearSession }}>
      {children}
    </AuthContext.Provider>
  );
}
