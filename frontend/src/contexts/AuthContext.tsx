/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useCallback, type ReactNode } from "react";
import { apiClient, setTokens, clearTokens } from "../api/client";
import type { AuthUser, TokenResponse } from "../types";

export interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
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
  const [isLoading, setIsLoading] = useState(false);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await apiClient.post<TokenResponse>("/auth/login", {
        email,
        password,
      });
      const { access_token, refresh_token } = response.data;
      setTokens(access_token, refresh_token);
      setUser(decodePayload(access_token));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
