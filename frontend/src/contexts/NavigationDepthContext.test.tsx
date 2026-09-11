import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MemoryRouter, useLocation, useNavigate, useSearchParams } from "react-router";
import { AuthContext, type AuthContextType } from "./AuthContext";
import { NavigationDepthProvider, useNavigationDepth } from "./NavigationDepthContext";

function signedInAs(id: number | undefined): AuthContextType {
  return {
    user: id === undefined ? null : { id, email: `user${id}@test.com`, name: "User", role: "member" },
    isLoading: false,
    login: async () => {},
    logout: async () => {},
    register: async () => {},
    changePassword: async () => {},
    updateProfile: async () => {},
  };
}

/** The counter under test, plus the three ways a page can move history. */
function Harness() {
  const depth = useNavigationDepth();
  const navigate = useNavigate();
  const location = useLocation();
  const [, setSearchParams] = useSearchParams();

  return (
    <>
      <p>{`depth: ${depth}`}</p>
      <p>{`address: ${location.pathname}`}</p>
      <button onClick={() => navigate("/next")}>push</button>
      <button onClick={() => navigate(-1)}>pop</button>
      <button onClick={() => setSearchParams({ sort: "name" }, { replace: true })}>replace</button>
    </>
  );
}

/** `entries` is the history the router mounts with — several of them is a
 *  session that already has pages behind it, which is what a reload lands in. */
function renderCounter(
  auth: AuthContextType = signedInAs(1),
  entries: string[] = ["/start"],
) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <NavigationDepthProvider>
          <Harness />
        </NavigationDepthProvider>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

function depth() {
  return screen.getByText(/^depth: /).textContent;
}

describe("NavigationDepth", () => {
  it("counts a push, and the next one", async () => {
    renderCounter();

    await userEvent.click(screen.getByRole("button", { name: "push" }));
    expect(depth()).toBe("depth: 1");

    await userEvent.click(screen.getByRole("button", { name: "push" }));
    expect(depth()).toBe("depth: 2");
  });

  // Never negative: the browser's forward button pops too (Decision 1), so the
  // counter has to survive more pops than it saw pushes.
  it("uncounts a pop, and floors at zero", async () => {
    renderCounter();

    await userEvent.click(screen.getByRole("button", { name: "push" }));
    expect(depth()).toBe("depth: 1");

    await userEvent.click(screen.getByRole("button", { name: "pop" }));
    expect(depth()).toBe("depth: 0");

    await userEvent.click(screen.getByRole("button", { name: "pop" }));
    expect(depth()).toBe("depth: 0");
  });

  // The whole reason NEU-1301 had to land first: a sort or a filter is a
  // preference about where you already are, it writes with `replace`, and it
  // must not put anything between the viewer and the page they came from.
  it("ignores a replace", async () => {
    renderCounter();

    await userEvent.click(screen.getByRole("button", { name: "push" }));
    await userEvent.click(screen.getByRole("button", { name: "replace" }));

    expect(depth()).toBe("depth: 1");
  });

  it("starts at zero — the entry location is not one we pushed", () => {
    renderCounter();

    expect(depth()).toBe("depth: 0");
  });

  // CONTEXT.md rule 2: nothing of one viewer's session is carried into the
  // next's on a shared device, a back destination included.
  it("resets to zero when the viewer changes", async () => {
    const { rerender } = renderCounter();

    await userEvent.click(screen.getByRole("button", { name: "push" }));
    expect(depth()).toBe("depth: 1");

    rerender(
      <AuthContext.Provider value={signedInAs(2)}>
        <MemoryRouter initialEntries={["/start"]}>
          <NavigationDepthProvider>
            <Harness />
          </NavigationDepthProvider>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(depth()).toBe("depth: 0");
  });

  // The reload case, and the one open question this ticket closes (project spec
  // §14 q3). The distinction from "starts at zero" above is the history: this
  // session mounts on its *second* entry, with a real page behind it that a
  // `navigate(-1)` would reach — and the counter still reads 0, because after a
  // reload the app cannot know whether that entry is one of ours. So the control
  // falls back to the named parent rather than guessing.
  it("is zero on a fresh mount even with history behind it", async () => {
    renderCounter(signedInAs(1), ["/behind", "/start"]);

    expect(depth()).toBe("depth: 0");

    // And it is genuinely there to go back to — the counter is conservative, not
    // describing an empty history.
    await userEvent.click(screen.getByRole("button", { name: "pop" }));
    expect(screen.getByText("address: /behind")).toBeInTheDocument();
  });
});
