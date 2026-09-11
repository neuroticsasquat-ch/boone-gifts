import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { AuthContext, type AuthContextType } from "../contexts/AuthContext";
import { NavigationDepthProvider } from "../contexts/NavigationDepthContext";
import { BackControl, BACK_TO_LISTS, BACK_TO_PEOPLE, backToFamily } from "./BackControl";
import type { BackDestination } from "./BackControl";

const AUTHENTICATED: AuthContextType = {
  user: { id: 1, email: "user@test.com", name: "Tom Boone", role: "member" },
  isLoading: false,
  login: async () => {},
  logout: async () => {},
  register: async () => {},
  changePassword: async () => {},
  updateProfile: async () => {},
};

/** Somewhere to arrive from, so a push has a page to come back to. */
function Lists() {
  const navigate = useNavigate();
  return <button onClick={() => navigate("/lists/1")}>open the list</button>;
}

function Address() {
  const location = useLocation();
  return <p>{`address: ${location.pathname}`}</p>;
}

function renderControl(fallback: BackDestination) {
  return render(
    <AuthContext.Provider value={AUTHENTICATED}>
      <MemoryRouter initialEntries={["/lists"]}>
        <NavigationDepthProvider>
          <Routes>
            <Route path="/lists" element={<Lists />} />
            <Route path="/lists/1" element={<BackControl fallback={fallback} />} />
            <Route path="*" element={<BackControl fallback={fallback} />} />
          </Routes>
          <Address />
        </NavigationDepthProvider>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

/** A deep link: the page is the entry location, so there is nothing behind it. */
function renderDeepLinked(fallback: BackDestination) {
  return render(
    <AuthContext.Provider value={AUTHENTICATED}>
      <MemoryRouter initialEntries={["/lists/1"]}>
        <NavigationDepthProvider>
          <BackControl fallback={fallback} />
        </NavigationDepthProvider>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("BackControl", () => {
  // At depth 0 it is a real address, so it is a real link — it cmd-clicks,
  // right-clicks and shows a status bar, and the status bar tells the truth.
  it("is a named link to the fallback when nothing is behind it", () => {
    renderDeepLinked(BACK_TO_LISTS);

    expect(screen.getByRole("link", { name: "← Back to Lists" })).toHaveAttribute("href", "/lists");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  // At depth > 0 it is an action with no destination, so it is a button: a link
  // would put /lists in the status bar while activation went somewhere else.
  it("is a plain Back button that returns you where you came from", async () => {
    renderControl(BACK_TO_LISTS);

    await userEvent.click(screen.getByRole("button", { name: "open the list" }));
    expect(screen.getByText("address: /lists/1")).toBeInTheDocument();

    const back = screen.getByRole("button", { name: "← Back" });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    await userEvent.click(back);
    expect(screen.getByText("address: /lists")).toBeInTheDocument();
  });

  it("names People when that is the fallback", () => {
    renderDeepLinked(BACK_TO_PEOPLE);

    expect(screen.getByRole("link", { name: "← Back to People" })).toHaveAttribute(
      "href",
      "/people",
    );
  });

  // The destination is known before the name is, so the link is already right
  // and only the word is pending — it never changes address mid-fetch.
  it("points at the family before its name has loaded, and says Family meanwhile", () => {
    const { unmount } = renderDeepLinked(backToFamily(3, undefined));

    expect(screen.getByRole("link", { name: "← Family" })).toHaveAttribute(
      "href",
      "/people/families/3",
    );

    unmount();
    renderDeepLinked(backToFamily(3, "Boone Family"));

    expect(screen.getByRole("link", { name: "← Boone Family" })).toHaveAttribute(
      "href",
      "/people/families/3",
    );
  });
});
