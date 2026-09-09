import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { MyShopping } from "./MyShopping";
import type { ShoppingScope } from "../lib/shopping";
import type { BudgetRollup, ShoppingItem } from "../types";

const API = "https://boone-gifts-api.localhost";

function item(overrides: Partial<ShoppingItem> = {}): ShoppingItem {
  return {
    claim_id: 100,
    gift_id: 20,
    name: "Cast iron skillet",
    description: null,
    url: null,
    price: "39.00",
    list_id: 10,
    list_name: "Jane's Wishlist",
    purchased_at: null,
    amount_paid: null,
    ...overrides,
  };
}

/** The rollup the tab's budget line reads. Defaulted to "no budget set" so a
 *  test about claims says nothing about money it does not care about. */
function budget(overrides: Partial<BudgetRollup> = {}): BudgetRollup {
  return {
    amount: null,
    spent: "0.00",
    remaining: null,
    bought_count: 0,
    total_count: 1,
    unpriced_count: 0,
    ...overrides,
  };
}

function renderShopping({
  items = [item()],
  scope = { kind: "occasion", id: 3 } as ShoppingScope,
  rollup = budget(),
}: { items?: ShoppingItem[]; scope?: ShoppingScope; rollup?: BudgetRollup } = {}) {
  const payload = { budget: rollup, items };
  server.use(
    http.get(`${API}/occasions/3/shopping`, () => HttpResponse.json(payload)),
    http.get(`${API}/folders/5/shopping`, () => HttpResponse.json(payload)),
  );

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MyShopping scope={scope} />
    </QueryClientProvider>,
  );
}

/** The card a list's claims sit in, found by its heading. */
function groupFor(listName: string) {
  return screen.getByRole("heading", { name: listName }).closest("div")!.parentElement!;
}

describe("MyShopping", () => {
  it("groups the viewer's claims under the list each came from", async () => {
    renderShopping({
      items: [
        item({ claim_id: 100, gift_id: 20, name: "Cast iron skillet" }),
        item({ claim_id: 101, gift_id: 21, name: "Running shoes" }),
        item({
          claim_id: 102,
          gift_id: 30,
          name: "Puzzle",
          list_id: 11,
          list_name: "Gran's List",
        }),
      ],
    });

    expect(await screen.findByRole("heading", { name: "Jane's Wishlist" })).toBeInTheDocument();
    expect(within(groupFor("Jane's Wishlist")).getAllByRole("listitem")).toHaveLength(2);
    expect(within(groupFor("Gran's List")).getAllByRole("listitem")).toHaveLength(1);
  });

  // Two lists routinely share a name — one "Christmas list" per person is the
  // ordinary case — and grouping on the name would merge them.
  it("keeps two lists with the same name apart", async () => {
    renderShopping({
      items: [
        item({ claim_id: 100, list_id: 10, list_name: "Christmas list" }),
        item({ claim_id: 101, gift_id: 21, list_id: 11, list_name: "Christmas list" }),
      ],
    });

    await waitFor(() =>
      expect(screen.getAllByRole("heading", { name: "Christmas list" })).toHaveLength(2),
    );
  });

  it("links a gift that has a url and leaves one that doesn't as plain text", async () => {
    renderShopping({
      items: [
        item({ claim_id: 100, name: "Running shoes", url: "https://example.com/shoes" }),
        item({ claim_id: 101, gift_id: 21, name: "Puzzle", url: null }),
      ],
    });

    expect(await screen.findByRole("link", { name: "Running shoes" })).toHaveAttribute(
      "href",
      "https://example.com/shoes",
    );
    expect(screen.queryByRole("link", { name: "Puzzle" })).not.toBeInTheDocument();
    expect(screen.getByText("Puzzle")).toBeInTheDocument();
  });

  // `price` is the *owner's* asking price and `amount_paid` is what the claimer
  // spent. They are never interchangeable, and both go through `formatMoney`.
  it("shows the owner's asking price as a hint and what the claimer paid as fact", async () => {
    renderShopping({
      items: [
        item({
          claim_id: 100,
          price: "39.5",
          purchased_at: "2026-09-01T00:00:00Z",
          amount_paid: "42",
        }),
      ],
    });

    expect(await screen.findByText("listed at $39.50")).toBeInTheDocument();
    expect(screen.getByText("you paid $42.00")).toBeInTheDocument();
  });

  it("says so when a purchase was recorded with no amount", async () => {
    renderShopping({
      items: [item({ purchased_at: "2026-09-01T00:00:00Z", amount_paid: null })],
    });

    expect(await screen.findByText("no amount recorded")).toBeInTheDocument();
  });

  // The line itself is `BudgetLine.test.tsx`; what belongs here is that the tab
  // mounts it, above the groups, from the same payload the claims came in.
  it("carries the budget line above the claims", async () => {
    renderShopping({
      rollup: {
        amount: "200.00",
        spent: "142.00",
        remaining: "58.00",
        bought_count: 3,
        total_count: 7,
        unpriced_count: 2,
      },
    });

    expect(await screen.findByText("$142.00 of $200.00 spent · $58.00 left")).toBeInTheDocument();
    expect(
      screen.getByText("3 of 7 bought · 2 purchases with no amount recorded"),
    ).toBeInTheDocument();
  });

  // A budget is worth setting before anything is claimed, so the line outlives
  // the empty state rather than being hidden behind it.
  it("still offers a budget when nothing is claimed yet", async () => {
    renderShopping({ items: [], rollup: budget({ total_count: 0 }) });

    expect(await screen.findByRole("button", { name: "Set budget" })).toBeInTheDocument();
  });

  // The write answers with the recomputed rollup, so the line changes without a
  // second read of the payload.
  it("shows a saved budget without re-reading the tab", async () => {
    let reads = 0;
    const payload = { budget: budget({ spent: "142.00" }), items: [item()] };
    server.use(
      http.get(`${API}/occasions/3/shopping`, () => {
        reads += 1;
        return HttpResponse.json(payload);
      }),
      http.put(`${API}/occasions/3/budget`, () =>
        HttpResponse.json({
          amount: "200.00",
          spent: "142.00",
          remaining: "58.00",
          bought_count: 3,
          total_count: 7,
          unpriced_count: 0,
        }),
      ),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MyShopping scope={{ kind: "occasion", id: 3 }} />
      </QueryClientProvider>,
    );

    await userEvent.click(await screen.findByRole("button", { name: "Set budget" }));
    await userEvent.type(screen.getByLabelText("Budget"), "200");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("$142.00 of $200.00 spent · $58.00 left")).toBeInTheDocument();
    expect(reads).toBe(1);
  });

  it("says nothing is here yet, in the words of the scope", async () => {
    renderShopping({ items: [] });
    expect(
      await screen.findByText("You haven't claimed anything for this occasion yet."),
    ).toBeInTheDocument();
  });

  it("reads a folder's claims from the folder endpoint", async () => {
    renderShopping({ scope: { kind: "folder", id: 5 } });

    expect(await screen.findByText("Cast iron skillet")).toBeInTheDocument();
  });

  it("offers a retry when the shopping read fails", async () => {
    server.use(
      http.get(`${API}/occasions/3/shopping`, () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 }),
      ),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MyShopping scope={{ kind: "occasion", id: 3 }} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Couldn't load your shopping.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  describe("recording a purchase", () => {
    it("reveals an empty prompt on ticking, with the asking price only as a hint", async () => {
      renderShopping({ items: [item({ price: "39.00" })] });

      await userEvent.click(
        await screen.findByRole("checkbox", { name: 'Mark "Cast iron skillet" as bought' }),
      );

      // Empty, never seeded from the owner's price: a budget pre-filled from
      // someone else's wishlist looks precise and is a guess.
      expect(screen.getByLabelText("What did you pay?")).toHaveValue("");
      expect(screen.getAllByText("listed at $39.00").length).toBeGreaterThan(0);
    });

    it("records what the claimer typed when they save", async () => {
      const posted = vi.fn();
      renderShopping();
      server.use(
        http.post(`${API}/lists/10/gifts/20/purchase`, async ({ request }) => {
          posted(await request.json());
          return HttpResponse.json({});
        }),
      );

      await userEvent.click(
        await screen.findByRole("checkbox", { name: 'Mark "Cast iron skillet" as bought' }),
      );
      await userEvent.type(screen.getByLabelText("What did you pay?"), "42.50");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(posted).toHaveBeenCalledWith({ amount_paid: "42.50" }));
    });

    // Skip is one click and sends no `amount_paid` at all — an unset field, not
    // a null, so any amount already recorded survives the round trip.
    it("records the purchase with the field unset when the claimer skips", async () => {
      let body = "not-called";
      renderShopping();
      server.use(
        http.post(`${API}/lists/10/gifts/20/purchase`, async ({ request }) => {
          body = await request.text();
          return HttpResponse.json({});
        }),
      );

      await userEvent.click(
        await screen.findByRole("checkbox", { name: 'Mark "Cast iron skillet" as bought' }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Skip" }));

      await waitFor(() => expect(body).toBe(""));
    });

    // Unticking leaves `amount_paid` standing on the server so re-ticking need
    // not retype it. A blank field would be saved as an explicit null, so the
    // prompt has to arrive carrying it.
    it("re-ticks with the amount the claimer already recorded, not a blank", async () => {
      renderShopping({ items: [item({ purchased_at: null, amount_paid: "42.00" })] });

      await userEvent.click(
        await screen.findByRole("checkbox", { name: 'Mark "Cast iron skillet" as bought' }),
      );

      expect(screen.getByLabelText("What did you pay?")).toHaveValue("42.00");
    });

    it("abandons an unanswered prompt when the tick is taken back", async () => {
      const posted = vi.fn();
      renderShopping();
      server.use(
        http.post(`${API}/lists/10/gifts/20/purchase`, async () => {
          posted();
          return HttpResponse.json({});
        }),
      );

      const tick = await screen.findByRole("checkbox", {
        name: 'Mark "Cast iron skillet" as bought',
      });
      await userEvent.click(tick);
      await userEvent.click(tick);

      expect(screen.queryByLabelText("What did you pay?")).not.toBeInTheDocument();
      expect(posted).not.toHaveBeenCalled();
    });

    it("unticks a recorded purchase through the purchase endpoint", async () => {
      const deleted = vi.fn();
      renderShopping({ items: [item({ purchased_at: "2026-09-01T00:00:00Z" })] });
      server.use(
        http.delete(`${API}/lists/10/gifts/20/purchase`, () => {
          deleted();
          return HttpResponse.json({});
        }),
      );

      await userEvent.click(
        await screen.findByRole("checkbox", { name: 'Mark "Cast iron skillet" as not bought' }),
      );

      await waitFor(() => expect(deleted).toHaveBeenCalled());
    });
  });

  describe("correcting a recorded amount", () => {
    // The ticket's headline case: a purchase ticked through without an amount,
    // filled in later without disturbing when it was bought.
    it("fills in an amount a purchase was recorded without", async () => {
      const patched = vi.fn();
      const posted = vi.fn();
      renderShopping({
        items: [item({ purchased_at: "2026-09-01T00:00:00Z", amount_paid: null })],
      });
      server.use(
        http.patch(`${API}/claims/100`, async ({ request }) => {
          patched(await request.json());
          return HttpResponse.json({});
        }),
        http.post(`${API}/lists/10/gifts/20/purchase`, () => {
          posted();
          return HttpResponse.json({});
        }),
      );

      await userEvent.click(
        await screen.findByRole("button", { name: 'Add amount for "Cast iron skillet"' }),
      );
      await userEvent.type(screen.getByLabelText("What did you pay?"), "42");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(patched).toHaveBeenCalledWith({ amount_paid: "42" }));
      // Never through a second POST, which would re-stamp `purchased_at` to
      // today and walk the purchase across an occasion boundary.
      expect(posted).not.toHaveBeenCalled();
    });

    it("seeds the editor from the claimer's own recorded amount", async () => {
      renderShopping({
        items: [item({ purchased_at: "2026-09-01T00:00:00Z", amount_paid: "42.00", price: "39" })],
      });

      await userEvent.click(
        await screen.findByRole("button", { name: 'Edit amount for "Cast iron skillet"' }),
      );

      expect(screen.getByLabelText("What did you pay?")).toHaveValue("42.00");
    });

    it("clears the amount when the editor is saved empty", async () => {
      const patched = vi.fn();
      renderShopping({
        items: [item({ purchased_at: "2026-09-01T00:00:00Z", amount_paid: "42.00" })],
      });
      server.use(
        http.patch(`${API}/claims/100`, async ({ request }) => {
          patched(await request.json());
          return HttpResponse.json({});
        }),
      );

      await userEvent.click(
        await screen.findByRole("button", { name: 'Edit amount for "Cast iron skillet"' }),
      );
      await userEvent.clear(screen.getByLabelText("What did you pay?"));
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(patched).toHaveBeenCalledWith({ amount_paid: null }));
    });

    it("leaves the amount alone when the editor is cancelled", async () => {
      const patched = vi.fn();
      renderShopping({
        items: [item({ purchased_at: "2026-09-01T00:00:00Z", amount_paid: "42.00" })],
      });
      server.use(
        http.patch(`${API}/claims/100`, async () => {
          patched();
          return HttpResponse.json({});
        }),
      );

      await userEvent.click(
        await screen.findByRole("button", { name: 'Edit amount for "Cast iron skillet"' }),
      );
      await userEvent.clear(screen.getByLabelText("What did you pay?"));
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(patched).not.toHaveBeenCalled();
      expect(screen.getByText("you paid $42.00")).toBeInTheDocument();
    });
  });
});
