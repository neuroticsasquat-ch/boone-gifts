import { useEffect } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { renderHook } from "@testing-library/react";
import { useSearchParamState, useEnumSearchParam, type SearchParamMode } from "./useSearchParamState";

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

describe("useSearchParamState — an unchanged value is not a move", () => {
  it("navigates nowhere when set to the value it already holds, in push mode", async () => {
    const user = userEvent.setup();

    function Probe() {
      const [value, setValue] = useSearchParamState("tab", { mode: "push" });
      const navigate = useNavigate();
      return (
        <>
          <p>at: {useLocation().pathname}</p>
          <p>tab: {value ?? "none"}</p>
          <button onClick={() => setValue("shopping")}>open shopping</button>
          <button onClick={() => navigate(-1)}>back</button>
        </>
      );
    }

    render(
      <MemoryRouter initialEntries={["/start", "/occasions/1?tab=shopping"]} initialIndex={1}>
        <Probe />
      </MemoryRouter>,
    );

    // Three clicks on the tab that is already active. A history entry per click
    // would mean three Back presses to leave the page (spec Decision 5).
    await user.click(screen.getByRole("button", { name: "open shopping" }));
    await user.click(screen.getByRole("button", { name: "open shopping" }));
    await user.click(screen.getByRole("button", { name: "open shopping" }));
    expect(screen.getByText("tab: shopping")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "back" }));
    expect(screen.getByText("at: /start")).toBeInTheDocument();
  });

  it("does not re-render on a no-op set", async () => {
    const user = userEvent.setup();
    let renders = 0;

    function Probe() {
      const [, setValue] = useSearchParamState("sort", { mode: "replace" });
      // Counted in an effect rather than during render: one tick per commit is
      // the same signal, and a render-phase write to an outer variable is a
      // side effect the linter rightly objects to.
      useEffect(() => {
        renders += 1;
      });
      return <button onClick={() => setValue("name")}>sort by name</button>;
    }

    render(
      <MemoryRouter initialEntries={["/lists?sort=name"]}>
        <Probe />
      </MemoryRouter>,
    );

    const before = renders;
    await user.click(screen.getByRole("button", { name: "sort by name" }));

    expect(renders).toBe(before);
  });

  it("still clears a key that is set, when null is the change", async () => {
    const user = userEvent.setup();

    function Probe() {
      const [value, setValue] = useSearchParamState("occasions", { mode: "replace" });
      return (
        <>
          <p>occasions: {value ?? "none"}</p>
          <p>search: {useLocation().search || "empty"}</p>
          <button onClick={() => setValue(null)}>collapse</button>
        </>
      );
    }

    render(
      <MemoryRouter initialEntries={["/lists?occasions=all"]}>
        <Probe />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "collapse" }));

    expect(screen.getByText("occasions: none")).toBeInTheDocument();
    expect(screen.getByText("search: empty")).toBeInTheDocument();
  });
});

const SORTS = ["updated", "name", "created"] as const;

describe("useEnumSearchParam", () => {
  function Probe({ mode = "replace" as SearchParamMode }) {
    const [sort, setSort] = useEnumSearchParam("sort", {
      mode,
      values: SORTS,
      fallback: "updated",
    });
    const navigate = useNavigate();
    return (
      <>
        <p>at: {useLocation().pathname}</p>
        <p>sort: {sort}</p>
        <p>search: {useLocation().search || "empty"}</p>
        <button onClick={() => setSort("name")}>by name</button>
        <button onClick={() => setSort("updated")}>by recent</button>
        <button onClick={() => navigate(-1)}>back</button>
      </>
    );
  }

  it("returns the URL's value when it is one of the values", () => {
    render(
      <MemoryRouter initialEntries={["/lists?sort=name"]}>
        <Probe />
      </MemoryRouter>,
    );

    expect(screen.getByText("sort: name")).toBeInTheDocument();
  });

  it("returns the fallback when the key is absent, and leaves the URL alone", () => {
    render(
      <MemoryRouter initialEntries={["/lists"]}>
        <Probe />
      </MemoryRouter>,
    );

    expect(screen.getByText("sort: updated")).toBeInTheDocument();
    expect(screen.getByText("search: empty")).toBeInTheDocument();
  });

  it("returns the fallback for an unrecognised value and scrubs it from the URL", async () => {
    render(
      <MemoryRouter initialEntries={["/lists?sort=bogus"]}>
        <Probe />
      </MemoryRouter>,
    );

    expect(screen.getByText("sort: updated")).toBeInTheDocument();
    // What the address says and what the page shows never disagree.
    await screen.findByText("search: empty");
  });

  it("leaves the other keys alone when it scrubs", async () => {
    render(
      <MemoryRouter initialEntries={["/lists?occasions=all&sort=bogus"]}>
        <Probe />
      </MemoryRouter>,
    );

    await screen.findByText("search: ?occasions=all");
  });

  it("scrubs by replacing even in push mode — Back reaches the entry before", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/start", "/lists?sort=bogus"]} initialIndex={1}>
        <Probe mode="push" />
      </MemoryRouter>,
    );

    await screen.findByText("search: empty");

    // A pushed heal would leave ?sort=bogus behind the viewer, which would heal
    // and push again — a page Back cannot leave (spec Decision 3).
    await user.click(screen.getByRole("button", { name: "back" }));
    expect(screen.getByText("at: /start")).toBeInTheDocument();
  });

  it("writes null for the fallback, leaving no key behind", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/lists"]}>
        <Probe />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "by name" }));
    expect(screen.getByText("search: ?sort=name")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "by recent" }));
    expect(screen.getByText("sort: updated")).toBeInTheDocument();
    expect(screen.getByText("search: empty")).toBeInTheDocument();
  });
});
