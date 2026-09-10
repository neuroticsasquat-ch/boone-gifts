import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import toast from "react-hot-toast";
import { server } from "../../test/mocks/server";
import { OccasionStrip } from "./OccasionStrip";

const API = "https://boone-gifts-api.localhost";

/** One row of `GET /occasions?archived=false`, as the index returns it. */
function summary(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    family_id: 10,
    name: "Christmas 2026",
    is_archived: false,
    created_by_id: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    family_name: "Boone Family",
    list_count: 3,
    my_claimed_count: 0,
    my_bought_count: 0,
    // Never null: the server floors it at created_at.
    last_activity_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function occasions(rows: ReturnType<typeof summary>[]) {
  server.use(http.get(`${API}/occasions`, () => HttpResponse.json(rows)));
}

/** The strip alone, at whichever URL the test needs. No AuthProvider: the strip
 *  reads no identity, only the one query. */
function renderStrip(path = "/lists") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <OccasionStrip />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Five occasions, so the "See all" control is in play. */
function five() {
  return [
    summary({ id: 1, name: "Christmas 2026" }),
    summary({ id: 2, name: "Diwali 2026" }),
    summary({ id: 3, name: "Mum's Birthday" }),
    summary({ id: 4, name: "Anniversary" }),
    summary({ id: 5, name: "Eid 2026" }),
  ];
}

describe("OccasionStrip", () => {
  // The contract is the same as ActionableBanner's: absent entirely, not empty.
  it("renders nothing at all when the viewer has no occasions", async () => {
    occasions([]);
    const { container } = renderStrip();

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByRole("heading", { name: /occasions/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Occasions" })).not.toBeInTheDocument();
  });

  it("renders a card per occasion with its name, family and list count", async () => {
    occasions([summary({ id: 7, name: "Christmas 2026", family_name: "Boone Family", list_count: 3 })]);
    renderStrip();

    const card = await screen.findByRole("listitem");
    expect(within(card).getByText("Christmas 2026")).toBeInTheDocument();
    // Not decoration: two families routinely both call an occasion "Christmas 2026".
    expect(within(card).getByText("Boone Family")).toBeInTheDocument();
    expect(within(card).getByText("3 lists")).toBeInTheDocument();
  });

  it("renders the cards in the order the server returned them", async () => {
    occasions(five());
    renderStrip();

    await screen.findByText("Christmas 2026");
    // The server orders by last_activity_at DESC, id DESC and the client never
    // re-sorts — the definition of that clock lives server-side.
    const names = screen.getAllByRole("listitem").map((card) => card.querySelector("p")?.textContent);
    expect(names).toEqual(["Christmas 2026", "Diwali 2026", "Mum's Birthday", "Anniversary"]);
  });

  it("suppresses the bought line entirely when the viewer has claimed nothing", async () => {
    occasions([summary({ my_claimed_count: 0, my_bought_count: 0 })]);
    renderStrip();

    const card = await screen.findByRole("listitem");
    // An untouched occasion reads as empty, not as "0 of 0 bought".
    expect(within(card).queryByText(/bought/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/0 of 0/)).not.toBeInTheDocument();
  });

  it("renders the bought line at zero bought, which is a real state", async () => {
    occasions([summary({ my_claimed_count: 3, my_bought_count: 0 })]);
    renderStrip();

    expect(await screen.findByText("0 of 3 bought")).toBeInTheDocument();
  });

  it("shows no monetary amount anywhere", async () => {
    occasions([
      summary({ id: 1, my_claimed_count: 4, my_bought_count: 2 }),
      summary({ id: 2, name: "Diwali 2026", my_claimed_count: 1, my_bought_count: 1 }),
    ]);
    const { container } = renderStrip();

    await screen.findByText("2 of 4 bought");
    // /lists is the first screen the app shows; a budget figure here puts the
    // viewer's spend in front of whoever is standing behind them. Fails loudly
    // if a later ticket imports BudgetLine.
    expect(container.textContent).not.toMatch(/[$£€]/);
  });

  it("shows four cards and a See all control when there are more", async () => {
    occasions(five());
    renderStrip();

    await screen.findByText("Christmas 2026");
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    // N is the total, not the remainder.
    expect(screen.getByRole("button", { name: "See all 5" })).toBeInTheDocument();
  });

  it("expands in place and collapses again from the same control", async () => {
    const user = userEvent.setup();
    occasions(five());
    renderStrip();

    await screen.findByText("Christmas 2026");
    await user.click(screen.getByRole("button", { name: "See all 5" }));

    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("Eid 2026")).toBeInTheDocument();

    // An expansion the viewer can set and cannot unset is a trap.
    const collapse = screen.getByRole("button", { name: "Show fewer" });
    await user.click(collapse);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "See all 5" })).toBeInTheDocument();
  });

  it("writes ?occasions=all without stacking a history entry", async () => {
    const user = userEvent.setup();
    occasions(five());

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function At() {
      return <p>at: {useLocation().pathname + useLocation().search}</p>;
    }
    function Back() {
      const navigate = useNavigate();
      return <button onClick={() => navigate(-1)}>back</button>;
    }
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/people", "/lists"]} initialIndex={1}>
          <At />
          <OccasionStrip />
          <Back />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText("Christmas 2026");
    await user.click(screen.getByRole("button", { name: "See all 5" }));
    expect(screen.getByText("at: /lists?occasions=all")).toBeInTheDocument();

    // The expansion is a preference about a page the viewer is already on, not
    // a place: Back leaves /lists rather than collapsing the strip.
    await user.click(screen.getByRole("button", { name: "back" }));
    expect(screen.getByText("at: /people")).toBeInTheDocument();
  });

  it("says nothing about a list count on an occasion with no lists", async () => {
    occasions([summary({ list_count: 0 })]);
    renderStrip();

    const card = await screen.findByRole("listitem");
    // The condition, and nothing more — not "0 lists" over "No lists yet".
    expect(within(card).getByText("No lists yet")).toBeInTheDocument();
    expect(within(card).queryByText(/0 lists/)).not.toBeInTheDocument();
  });

  it("offers no control when there are four or fewer", async () => {
    occasions(five().slice(0, 4));
    renderStrip();

    await screen.findByText("Christmas 2026");
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: /See all/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show fewer" })).not.toBeInTheDocument();
  });

  it("renders expanded on first paint at /lists?occasions=all", async () => {
    occasions(five());
    renderStrip("/lists?occasions=all");

    await screen.findByText("Christmas 2026");
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Show fewer" })).toBeInTheDocument();
  });

  it("states the condition on an occasion with no lists, and still links to it", async () => {
    occasions([summary({ id: 9, list_count: 0 })]);
    renderStrip();

    const card = await screen.findByRole("listitem");
    // The condition and no instruction: NEU-1308 brings the control, and the
    // wording arrives with the thing it describes.
    expect(within(card).getByText("No lists yet")).toBeInTheDocument();
    // Every occasion keeps its route — that page holds the budget and the
    // shopping tab, which is the whole argument of ADR 0007.
    expect(within(card).getByRole("link")).toHaveAttribute("href", "/occasions/9");
  });

  it("shows both the empty-body sentence and the bought line on an unshared occasion", async () => {
    // A claim filed under an occasion survives its list being unshared, so 0
    // lists and a non-zero bought line is a legitimate pair (NEU-1292).
    occasions([summary({ id: 9, list_count: 0, my_claimed_count: 2, my_bought_count: 1 })]);
    renderStrip();

    const card = await screen.findByRole("listitem");
    expect(within(card).getByText("No lists yet")).toBeInTheDocument();
    expect(within(card).getByText("1 of 2 bought")).toBeInTheDocument();
  });

  it("renders nothing while the query is pending", () => {
    server.use(http.get(`${API}/occasions`, () => new Promise(() => {})));
    const { container } = renderStrip();

    // No skeleton: a placeholder that collapses to nothing for a viewer with no
    // occasions is its own flash.
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing and says so when the load fails", async () => {
    const error = vi.spyOn(toast, "error").mockImplementation(() => "");
    server.use(http.get(`${API}/occasions`, () => new HttpResponse(null, { status: 500 })));

    const { container } = renderStrip();

    // A viewer who has occasions and sees no strip otherwise cannot tell a
    // failure from having none.
    await waitFor(() => expect(error).toHaveBeenCalledWith("Couldn't load your occasions."));
    expect(container).toBeEmptyDOMElement();
    error.mockRestore();
  });
});
