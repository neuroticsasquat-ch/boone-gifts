import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { renderHook } from "@testing-library/react";
import { useSearchParamState } from "./useSearchParamState";

/** Renders the hook under a real router, since the whole point of the hook is
 *  what it does to the history stack. */
function wrapper(initialEntries: string[]) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>;
  };
}

describe("useSearchParamState", () => {
  it("reads a value already in the URL as the initial value", () => {
    const { result } = renderHook(() => useSearchParamState("occasions", { mode: "replace" }), {
      wrapper: wrapper(["/lists?occasions=all"]),
    });

    expect(result.current[0]).toBe("all");
  });

  it("is null when the key is absent", () => {
    const { result } = renderHook(() => useSearchParamState("occasions", { mode: "replace" }), {
      wrapper: wrapper(["/lists"]),
    });

    expect(result.current[0]).toBeNull();
  });

  it("removes the key entirely when set to null", () => {
    const { result } = renderHook(
      () => {
        const state = useSearchParamState("occasions", { mode: "replace" });
        return { state, search: useLocation().search };
      },
      { wrapper: wrapper(["/lists?occasions=all"]) },
    );

    act(() => result.current.state[1](null));

    expect(result.current.state[0]).toBeNull();
    // Not `?occasions=`: an unset preference leaves no trace at all.
    expect(result.current.search).toBe("");
  });

  it("does not grow history in replace mode — Back leaves the page", async () => {
    const user = userEvent.setup();

    function Probe() {
      const [value, setValue] = useSearchParamState("sort", { mode: "replace" });
      const navigate = useNavigate();
      return (
        <>
          <p>at: {useLocation().pathname}</p>
          <p>sort: {value ?? "none"}</p>
          <button onClick={() => setValue("name")}>set sort</button>
          <button onClick={() => navigate(-1)}>back</button>
        </>
      );
    }

    render(
      <MemoryRouter initialEntries={["/start", "/lists"]} initialIndex={1}>
        <Probe />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "set sort" }));
    expect(screen.getByText("sort: name")).toBeInTheDocument();

    // Setting it replaced the /lists entry rather than stacking a second one,
    // so one step back is the page the viewer came from — not /lists with the
    // sort unset.
    await user.click(screen.getByRole("button", { name: "back" }));
    expect(screen.getByText("at: /start")).toBeInTheDocument();
  });

  it("grows history in push mode — Back restores the previous value", async () => {
    const user = userEvent.setup();

    function Probe() {
      const [value, setValue] = useSearchParamState("tab", { mode: "push" });
      const navigate = useNavigate();
      return (
        <>
          <p>tab: {value ?? "none"}</p>
          <button onClick={() => setValue("shopping")}>open shopping</button>
          <button onClick={() => navigate(-1)}>back</button>
        </>
      );
    }

    render(
      <MemoryRouter initialEntries={["/occasions/1?tab=lists"]}>
        <Probe />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "open shopping" }));
    expect(screen.getByText("tab: shopping")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "back" }));
    expect(screen.getByText("tab: lists")).toBeInTheDocument();
  });

  it("keeps two keys on one page from clobbering each other", async () => {
    const user = userEvent.setup();

    function Probe() {
      const [occasions, setOccasions] = useSearchParamState("occasions", { mode: "replace" });
      const [sort, setSort] = useSearchParamState("sort", { mode: "replace" });
      return (
        <>
          <p>occasions: {occasions ?? "none"}</p>
          <p>sort: {sort ?? "none"}</p>
          <button onClick={() => setOccasions("all")}>expand</button>
          <button onClick={() => setSort("name")}>sort by name</button>
        </>
      );
    }

    render(
      <MemoryRouter initialEntries={["/lists"]}>
        <Probe />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "expand" }));
    await user.click(screen.getByRole("button", { name: "sort by name" }));

    expect(screen.getByText("occasions: all")).toBeInTheDocument();
    expect(screen.getByText("sort: name")).toBeInTheDocument();
  });
});
