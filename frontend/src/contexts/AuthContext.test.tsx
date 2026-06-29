import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "../hooks/useAuth";

// Helper component that exposes simple_mode for testing
function SimpleModeConsumer() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div>Loading...</div>;
  return <div data-testid="simple-mode">{user ? String(user.simple_mode) : "none"}</div>;
}

function ToggleConsumer() {
  const { user, isLoading, toggleSimpleMode } = useAuth();
  if (isLoading) return <div>Loading...</div>;
  return (
    <div>
      <div data-testid="simple-mode">{user ? String(user.simple_mode) : "none"}</div>
      <button onClick={() => toggleSimpleMode()}>Toggle</button>
    </div>
  );
}

// Helper component that exposes auth state for testing
function AuthConsumer() {
  const { user, login, logout, register, isLoading } = useAuth();

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <div data-testid="user">{user ? user.email : "none"}</div>
      <button onClick={() => login("test@test.com", "password")}>Login</button>
      <button onClick={() => register("tok-1", "Tester", "password", "test@test.com")}>
        Register
      </button>
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
}

// JWT with payload: {"sub":"1","email":"test@test.com","role":"member","exp":9999999999}
// This is a real base64-encoded JWT (header.payload.signature) - the signature is fake but the payload decodes correctly
const fakeAccessToken = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(JSON.stringify({ sub: "1", email: "test@test.com", role: "member", exp: 9999999999 })),
  "fake-signature",
].join(".");

// JWT with payload: { sub: "1", email: "test@test.com", role: "member", simple_mode: true, exp: 9999999999 }
const simpleModeToken = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(JSON.stringify({ sub: "1", email: "test@test.com", role: "member", simple_mode: true, exp: 9999999999 })),
  "fake-signature",
].join(".");

describe("AuthContext", () => {
  it("starts with no user after silent refresh fails", async () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

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

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("test@test.com");
    });
  });

  it("login stores user from JWT", async () => {
    server.use(
      http.post("https://boone-gifts-api.localhost/auth/login", () => {
        return HttpResponse.json({
          access_token: fakeAccessToken,
          token_type: "bearer",
        });
      })
    );

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

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
    server.use(
      http.post("https://boone-gifts-api.localhost/auth/login", () => {
        return HttpResponse.json({
          access_token: fakeAccessToken,
          token_type: "bearer",
        });
      }),
      http.post("https://boone-gifts-api.localhost/auth/logout", () => {
        return new HttpResponse(null, { status: 204 });
      })
    );

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

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

  it("decodes simple_mode from JWT payload", async () => {
    server.use(
      http.post("https://boone-gifts-api.localhost/auth/refresh", () => {
        return HttpResponse.json({ access_token: simpleModeToken, token_type: "bearer" });
      })
    );

    render(
      <AuthProvider>
        <SimpleModeConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("simple-mode")).toHaveTextContent("true");
    });
  });

  it("register stores user from JWT", async () => {
    server.use(
      http.post("https://boone-gifts-api.localhost/auth/register", () => {
        return HttpResponse.json({ access_token: fakeAccessToken, token_type: "bearer" });
      })
    );

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("none");
    });

    await userEvent.click(screen.getByText("Register"));

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("test@test.com");
    });
  });

  it("toggleSimpleMode calls PUT /auth/profile and updates user.simple_mode", async () => {
    // Token with simple_mode: false — starts in full mode
    const fullToken = [
      btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
      btoa(JSON.stringify({ sub: "1", email: "test@test.com", role: "member", simple_mode: false, exp: 9999999999 })),
      "fake-signature",
    ].join(".");

    // Token the server returns after toggling ON
    const simpleToken = [
      btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
      btoa(JSON.stringify({ sub: "1", email: "test@test.com", role: "member", simple_mode: true, exp: 9999999999 })),
      "fake-signature",
    ].join(".");

    server.use(
      http.post("https://boone-gifts-api.localhost/auth/refresh", () =>
        HttpResponse.json({ access_token: fullToken, token_type: "bearer" })
      ),
      http.put("https://boone-gifts-api.localhost/auth/profile", () =>
        HttpResponse.json({ access_token: simpleToken, token_type: "bearer" })
      )
    );

    render(
      <AuthProvider>
        <ToggleConsumer />
      </AuthProvider>
    );

    // Wait for session to restore (simple_mode: false)
    await waitFor(() => {
      expect(screen.getByTestId("simple-mode")).toHaveTextContent("false");
    });

    await userEvent.click(screen.getByText("Toggle"));

    // After toggle, user.simple_mode should be true (from the new token)
    await waitFor(() => {
      expect(screen.getByTestId("simple-mode")).toHaveTextContent("true");
    });
  });
});
