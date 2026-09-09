/* eslint-disable react/only-export-components */
import {
  createContext,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  apiClient,
  setAccessToken,
  clearAccessToken,
  setSessionEndedHandler,
} from "../api/client";
import {
  logout as apiLogout,
  register as apiRegister,
  changePassword as apiChangePassword,
  updateProfile as apiUpdateProfile,
} from "../api/auth";
import type { AuthUser, AccessTokenResponse } from "../types";

export interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (token: string, name: string, password: string, email: string) => Promise<void>;
  updateProfile: (name: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

function decodePayload(token: string): AuthUser {
  const base64Url = token.split(".")[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const payload = JSON.parse(atob(base64));
  return {
    id: Number(payload.sub),
    email: payload.email,
    name: payload.name ?? "",
    role: payload.role,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  // The cache is keyed by resource, never by viewer (ADR 0004), so one person's entries
  // would otherwise be served to the next. Keyed on the id and not the user object:
  // updateProfile renaming someone is not a change of viewer.
  //
  // A viewer leaving empties the cache outright. A viewer arriving sweeps what is left
  // unobserved instead: a mutation that outlived the departing viewer's last screen can
  // still write its response in after that clear (mutations are not cancelled by it), and
  // an arrival is the last moment to catch that before the next person is served it. The
  // sweep spares observed and in-flight queries, which an outright clear would strand.
  //
  // A layout effect, not a passive one, and both halves depend on it:
  //   - The screens the arriving viewer mounts read the cache while they render. A passive
  //     effect fires after that render is painted, so the previous viewer's data reaches
  //     the new one's screen before it is dropped.
  //   - React Query subscribes an observer in a passive effect, which for a child runs
  //     BEFORE this one. So by the time a passive sweep ran, a screen mounted in the same
  //     commit had already claimed the stale entry, making it active and sparing it from
  //     the sweep entirely — it was then served for the full staleTime.
  // Running here, before paint and before any child subscribes, closes both. Queries
  // observed from an earlier commit are still active and still spared.
  const viewerId = useRef(user?.id);
  useLayoutEffect(() => {
    const departing = viewerId.current;
    viewerId.current = user?.id;
    if (departing === user?.id) return;
    if (departing !== undefined) {
      queryClient.clear();
    } else if (user?.id !== undefined) {
      queryClient.removeQueries({ type: "inactive" });
    }
  }, [user?.id, queryClient]);

  // The 401 interceptor cannot reach React state, so it calls back in here when a refresh
  // gives up. Clearing the user both empties the cache above and lands the viewer on
  // /login instead of stranding them on a mounted page with a dead token.
  useEffect(() => {
    setSessionEndedHandler(() => setUser(null));
    return () => setSessionEndedHandler(null);
  }, []);

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

  const register = useCallback(
    async (token: string, name: string, password: string, email: string) => {
      setIsLoading(true);
      try {
        const { access_token } = await apiRegister(token, name, password, email);
        setAccessToken(access_token);
        setUser(decodePayload(access_token));
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const updateProfile = useCallback(async (name: string) => {
    const { access_token } = await apiUpdateProfile(name);
    setAccessToken(access_token);
    setUser(decodePayload(access_token));
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const { access_token } = await apiChangePassword(currentPassword, newPassword);
      setAccessToken(access_token);
      setUser(decodePayload(access_token));
    },
    []
  );

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, register, updateProfile, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}
