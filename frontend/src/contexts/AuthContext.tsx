/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { apiClient, setAccessToken, clearAccessToken } from "../api/client";
import { logout as apiLogout } from "../api/auth";
import type { AuthUser, AccessTokenResponse } from "../types";

export interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

function decodePayload(token: string): AuthUser {
  const base64Url = token.split(".")[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const payload = JSON.parse(atob(base64));
  return {
    id: Number(payload.sub),
    email: payload.email,
    role: payload.role,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Silent refresh on mount — restores session if cookie exists
  useEffect(() => {
    apiClient
      .post<AccessTokenResponse>("/auth/refresh")
      .then((response) => {
        const { access_token } = response.data;
        setAccessToken(access_token);
        setUser(decodePayload(access_token));
      })
      .catch(() => {
        // No valid cookie — stay logged out
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await apiClient.post<AccessTokenResponse>("/auth/login", {
        email,
        password,
      });
      const { access_token } = response.data;
      setAccessToken(access_token);
      setUser(decodePayload(access_token));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // Best-effort — clear local state regardless
    }
    clearAccessToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
