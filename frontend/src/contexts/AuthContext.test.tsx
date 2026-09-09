import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { server } from "../test/mocks/server";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "../hooks/useAuth";
import { apiClient, clearAccessToken } from "../api/client";

// Helper component that exposes auth state for testing
function AuthConsumer() {
  const { user, login, logout, register, updateProfile, isLoading } = useAuth();

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <div data-testid="user">{user ? user.email : "none"}</div>
      <button onClick={() => login("test@test.com", "password")}>Login</button>
      <button onClick={() => register("tok-1", "Tester", "password", "test@test.com")}>
        Register
      </button>
      <button onClick={() => logout()}>Logout</button>
      <button onClick={() => updateProfile("Renamed")}>Rename</button>
      <button onClick={() => apiClient.get("/test").catch(() => {})}>Fetch</button>
    </div>
  );
}

// A real base64-encoded JWT (header.payload.signature) — the signature is fake but the
// payload decodes correctly.
function tokenFor(sub: string, email: string, name = "Tester"): string {
  return [
    btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    btoa(JSON.stringify({ sub, email, name, role: "member", exp: 9999999999 })),
    "fake-signature",
  ].join(".");
}

const fakeAccessToken = tokenFor("1", "test@test.com");
const otherAccessToken = tokenFor("2", "other@test.com");

function loginReturns(token: string) {
  return http.post("https://boone-gifts-api.localhost/auth/login", () =>
    HttpResponse.json({ access_token: token, token_type: "bearer" })
  );
}

const logoutSucceeds = http.post(
  "https://boone-gifts-api.localhost/auth/logout",
  () => new HttpResponse(null, { status: 204 })
);

let queryClient: QueryClient;

function renderAuth() {
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    </QueryClientProvider>
  );
}

/** Stand in for any cached view — the keys are resource-shaped, never viewer-shaped. */
function seedCache() {
  queryClient.setQueryData(["lists"], [{ id: 1, name: "A's list" }]);
  queryClient.setQueryData(["shopping", "claimed", 1], [{ id: 9, amount_cents: 4200 }]);
}

function cachedKeyCount() {
  return queryClient.getQueryCache().getAll().length;
}

beforeEach(() => {
  clearAccessToken();
  queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: false } },
  });
});

describe("AuthContext", () => {
  it("starts with no user after silent refresh fails", async () => {
    renderAuth();

    // Starts loading while silent refresh runs
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    // After refresh fails (default handler returns 401), shows no user
    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("none");
    });
  });

  it("restores session when silent refresh succeeds", async () => {
    server.use(
      http.post("https://boone-gifts-api.localhost/auth/refresh", () => {
        return HttpResponse.json({
          access_token: fakeAccessToken,
          token_type: "bearer",
        });
      })
    );

    renderAuth();

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("test@test.com");
    });
  });

  it("login stores user from JWT", async () => {
    server.use(loginReturns(fakeAccessToken));

    renderAuth();

    // Wait for silent refresh to complete first
    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("none");
    });

    await userEvent.click(screen.getByText("Login"));

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("test@test.com");
    });
  });

  it("logout clears the user", async () => {
    server.use(loginReturns(fakeAccessToken), logoutSucceeds);

    renderAuth();

    // Wait for silent refresh to complete
    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("none");
    });

    await userEvent.click(screen.getByText("Login"));
    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("test@test.com");
    });

    await userEvent.click(screen.getByText("Logout"));
    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("none");
    });
  });

  it("register stores user from JWT", async () => {
    server.use(
      http.post("https://boone-gifts-api.localhost/auth/register", () => {
        return HttpResponse.json({ access_token: fakeAccessToken, token_type: "bearer" });
      })
    );

    renderAuth();

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("none");
    });

    await userEvent.click(screen.getByText("Register"));

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("test@test.com");
    });
  });
});

// Pinned at the seam rather than per-screen: one assertion that the cache is empty after
// an identity change is worth more than a test per page, and it does not rot as pages are
// added. See ADR 0004.
describe("AuthContext — the query cache at the identity boundary", () => {
  it("empties the cache when the viewer logs out", async () => {
    server.use(loginReturns(fakeAccessToken), logoutSucceeds);

    renderAuth();
    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("none");
    });

    await userEvent.click(screen.getByText("Login"));
    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("test@test.com");
    });

    seedCache();
    expect(cachedKeyCount()).toBe(2);

    await userEvent.click(screen.getByText("Logout"));

    await waitFor(() => {
      expect(cachedKeyCount()).toBe(0);
    });
    expect(queryClient.getQueryData(["lists"])).toBeUndefined();
  });

  it("empties the cache when a different viewer logs in with no logout before it", async () => {
    server.use(loginReturns(fakeAccessToken));

    renderAuth();
    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("none");
    });

    await userEvent.click(screen.getByText("Login"));
    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("test@test.com");
    });

    seedCache();

    // The token-expiry path: a second login in the same tab, never having logged out.
    server.use(loginReturns(otherAccessToken));
    await userEvent.click(screen.getByText("Login"));
    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("other@test.com");
    });

    expect(cachedKeyCount()).toBe(0);
    expect(queryClient.getQueryData(["shopping", "claimed", 1])).toBeUndefined();
  });

  it("keeps the cache when updateProfile renames the current viewer", async () => {
    server.use(
      loginReturns(fakeAccessToken),
      http.put("https://boone-gifts-api.localhost/auth/profile", () =>
        // Same sub, new name — a rename is not a change of viewer.
        HttpResponse.json({
          access_token: tokenFor("1", "test@test.com", "Renamed"),
          token_type: "bearer",
        })
      )
    );

    renderAuth();
    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("none");
    });

    await userEvent.click(screen.getByText("Login"));
    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("test@test.com");
    });

    seedCache();
    await userEvent.click(screen.getByText("Rename"));

    await waitFor(() => {
      expect(queryClient.getQueryData(["lists"])).toEqual([{ id: 1, name: "A's list" }]);
    });
    expect(cachedKeyCount()).toBe(2);
  });

  it("sweeps entries a departed viewer left behind when the next one arrives", async () => {
    // queryClient.clear() does not cancel mutations, so one that outlived the departing
    // viewer's last screen can write its response in after the clear. The arriving viewer
    // must not be served it. Standing in for that write directly, since what matters is
    // that an unobserved entry present at arrival does not survive.
    server.use(loginReturns(fakeAccessToken));

    renderAuth();
    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("none");
    });

    // A's account payload, landed after A left and with nothing observing it.
    seedCache();

    await userEvent.click(screen.getByText("Login"));
    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("test@test.com");
    });

    expect(cachedKeyCount()).toBe(0);
  });

  it("does not serve a leftover entry to a screen that claims it as the next viewer mounts", async () => {
    // The sweep has to beat the arriving screen to the entry. React Query subscribes its
    // observer in a passive effect, and a child's runs before the provider's, so a passive
    // sweep arrived too late: the screen had already made the stale entry active, which
    // spared it from the sweep, and staleTime then served it for 30s without a refetch.
    server.use(
      loginReturns(fakeAccessToken),
      http.get("https://boone-gifts-api.localhost/account", () =>
        HttpResponse.json({ owner: "B" })
      )
    );

    function Account() {
      const { data } = useQuery({
        queryKey: ["account"],
        queryFn: async () => (await apiClient.get("/account")).data,
      });
      return <div data-testid="account">{JSON.stringify(data ?? null)}</div>;
    }

    function Gate() {
      // Mounts only once a viewer exists — what ProtectedRoute does.
      const { user } = useAuth();
      return user ? <Account /> : null;
    }

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AuthConsumer />
          <Gate />
        </AuthProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("none");
    });

    // A's payload, written in late by a mutation that outlived A's last screen.
    queryClient.setQueryData(["account"], { owner: "A" });

    await userEvent.click(screen.getByText("Login"));
    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("test@test.com");
    });

    await waitFor(() => {
      expect(screen.getByTestId("account")).toHaveTextContent('{"owner":"B"}');
    });
  });

  it("does not strand a query already running when a session is restored", async () => {
    // The arrival sweep spares observed queries: an outright clear here drops one that is
    // still in flight and leaves its observer pending forever.
    server.use(
      http.post("https://boone-gifts-api.localhost/auth/refresh", () =>
        HttpResponse.json({ access_token: fakeAccessToken, token_type: "bearer" })
      ),
      http.get("https://boone-gifts-api.localhost/test", () => HttpResponse.json({ ok: true }))
    );

    function LiveQuery() {
      const { data, isPending } = useQuery({
        queryKey: ["lists"],
        // Slow enough to still be in flight when the silent refresh resolves — the case
        // an outright clear strands, since the dropped query never settles its observer.
        queryFn: async () => {
          await new Promise((resolve) => setTimeout(resolve, 30));
          return (await apiClient.get("/test")).data;
        },
      });
      return <div data-testid="live">{isPending ? "pending" : JSON.stringify(data)}</div>;
    }

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AuthConsumer />
          <LiveQuery />
        </AuthProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("test@test.com");
    });
    await waitFor(() => {
      expect(screen.getByTestId("live")).toHaveTextContent('{"ok":true}');
    });
  });

  it("ends the session and empties the cache when a refresh fails mid-session", async () => {
    server.use(
      loginReturns(fakeAccessToken),
      http.get("https://boone-gifts-api.localhost/test", () =>
        HttpResponse.json({ detail: "Unauthorized" }, { status: 401 })
      )
      // /auth/refresh keeps the default handler: 401.
    );

    renderAuth();
    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("none");
    });

    await userEvent.click(screen.getByText("Login"));
    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("test@test.com");
    });

    seedCache();

    // A request 401s, the refresh behind it fails, and the session ends rather than
    // stranding the viewer on a mounted page with a dead token.
    await userEvent.click(screen.getByText("Fetch"));

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("none");
    });
    expect(cachedKeyCount()).toBe(0);
  });

  it("does not loop when a second request fails after the session has ended", async () => {
    // clear() drops entries that still have observers, so those refetch once against a
    // dead token and reject. The second failure changes no id, so it triggers no further
    // clear. ADR 0004, "Bad, and accepted".
    let refreshAttempts = 0;
    server.use(
      loginReturns(fakeAccessToken),
      http.get("https://boone-gifts-api.localhost/test", () =>
        HttpResponse.json({ detail: "Unauthorized" }, { status: 401 })
      ),
      http.post("https://boone-gifts-api.localhost/auth/refresh", () => {
        refreshAttempts++;
        return HttpResponse.json({ detail: "Unauthorized" }, { status: 401 });
      })
    );

    renderAuth();
    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("none");
    });

    await userEvent.click(screen.getByText("Login"));
    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("test@test.com");
    });

    const attemptsAfterMount = refreshAttempts;

    await userEvent.click(screen.getByText("Fetch"));
    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("none");
    });

    await userEvent.click(screen.getByText("Fetch"));
    await waitFor(() => {
      expect(refreshAttempts).toBe(attemptsAfterMount + 2);
    });

    // Still logged out, still empty — no cascade of clears, no re-entry.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByTestId("user")).toHaveTextContent("none");
    expect(cachedKeyCount()).toBe(0);
    expect(refreshAttempts).toBe(attemptsAfterMount + 2);
  });
});
