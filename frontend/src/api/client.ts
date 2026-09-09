import axios from "axios";

let accessToken: string | null = null;

export function setAccessToken(token: string): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function clearAccessToken(): void {
  accessToken = null;
}

let onSessionEnded: (() => void) | null = null;

/** Registered by AuthProvider. The interceptor cannot reach React state directly,
 *  and the token accessors above already work this way. */
export function setSessionEndedHandler(handler: (() => void) | null): void {
  onSessionEnded = handler;
}

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "https://boone-gifts-api.localhost",
  withCredentials: true,
});

// Attach access token to every request
apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Handle 401: attempt refresh, retry original request
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}> = [];

function processQueue(error: unknown): void {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(undefined);
    }
  });
  failedQueue = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Don't attempt refresh for auth endpoints (prevents infinite loops)
    const url: string = originalRequest.url ?? "";
    if (url.startsWith("/auth/")) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(() => {
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const response = await apiClient.post("/auth/refresh");
      const newAccessToken: string = response.data.access_token;
      setAccessToken(newAccessToken);
      processQueue(null);
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      clearAccessToken();
      onSessionEnded?.();
      processQueue(refreshError);
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);
