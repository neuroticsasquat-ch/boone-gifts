import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "../hooks/useAuth";

// Helper component that exposes auth state for testing
function AuthConsumer() {
  const { user, login, logout, isLoading } = useAuth();

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <div data-testid="user">{user ? user.email : "none"}</div>
      <button onClick={() => login("test@test.com", "password")}>Login</button>
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

describe("AuthContext", () => {
  it("starts with no user", () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );
    expect(screen.getByTestId("user")).toHaveTextContent("none");
  });

  it("login stores user from JWT", async () => {
    server.use(
      http.post("https://boone-gifts-api.localhost/auth/login", () => {
        return HttpResponse.json({
          access_token: fakeAccessToken,
          refresh_token: "fake-refresh",
          token_type: "bearer",
        });
      })
    );

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

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
          refresh_token: "fake-refresh",
          token_type: "bearer",
        });
      })
    );

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await userEvent.click(screen.getByText("Login"));
    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("test@test.com");
    });

    await userEvent.click(screen.getByText("Logout"));
    expect(screen.getByTestId("user")).toHaveTextContent("none");
  });
});
