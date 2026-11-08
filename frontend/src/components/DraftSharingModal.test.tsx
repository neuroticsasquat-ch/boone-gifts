import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { DraftSharingModal } from "./DraftSharingModal";
import type { SharingSelection } from "./SharingModal";

const API = "https://boone-gifts-api.localhost";

const families = [
  { id: 7, name: "The Boones", role: "organizer", member_count: 3 },
  { id: 8, name: "The Smiths", role: "member", member_count: 2 },
  { id: 9, name: "Work Friends", role: "member", member_count: 4 },
];

/** The occasion index as `GET /occasions` answers it: every non-archived
 *  occasion in every family the caller belongs to, each naming its family. */
function indexed(id: number, familyId: number, name: string) {
  return {
    id,
    family_id: familyId,
    family_name: families.find((f) => f.id === familyId)?.name ?? "",
    name,
    is_archived: false,
    created_by_id: 1,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    list_count: 0,
    my_claimed_count: 0,
    my_bought_count: 0,
    last_activity_at: "2026-01-01",
  };
}

const occasionIndex = [
  indexed(70, 7, "Christmas 2026"),
  indexed(80, 8, "Smith Christmas"),
  indexed(81, 8, "Smith Birthdays"),
];

const connections = [
  {
    id: 5,
    status: "accepted",
    user: { id: 2, name: "Alice", email: "alice@test.com" },
    created_at: "2026-01-01",
    accepted_at: "2026-01-02",
  },
  {
    id: 6,
    status: "accepted",
    user: { id: 3, name: "Bob", email: "bob@test.com" },
    created_at: "2026-01-01",
    accepted_at: "2026-01-02",
  },
];

const nothing: SharingSelection = { familyOccasions: {}, userIds: [] };

function serveDraft({ people = connections } = {}) {
  server.use(
    http.get(`${API}/families`, () => HttpResponse.json(families)),
    http.get(`${API}/occasions`, () => HttpResponse.json(occasionIndex)),
    http.get(`${API}/connections`, () => HttpResponse.json(people)),
  );
}

function renderDraft(selection: SharingSelection = nothing) {
  const onChange = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DraftSharingModal selection={selection} onChange={onChange} onClose={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { onChange };
}

describe("DraftSharingModal — the same dialog, over a list that does not exist yet", () => {
  it("arrives with nothing ticked, however many families have one occasion", async () => {
    // The behaviour change this ticket exists for: a list created to hold a
    // private idea is not visible to anyone before its first gift.
    serveDraft();

    renderDraft();

    expect(await screen.findByRole("checkbox", { name: /share with the boones/i })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /share with the smiths/i })).not.toBeChecked();
    expect(screen.getByText("This list isn't shared with anyone.")).toBeInTheDocument();
  });

  it("shapes each family's row from the occasion index alone", async () => {
    // One occasion is displayed, several are offered — the same three-state
    // rule the list page's dialog renders, from a different pair of reads.
    const fannedOut = vi.fn();
    serveDraft();
    server.use(
      http.get(`${API}/families/:familyId/occasions`, () => {
        fannedOut();
        return HttpResponse.json([]);
      }),
    );

    renderDraft();

    expect(await screen.findByText("Christmas 2026")).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: /occasion for the boones/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /occasion for the smiths/i })).toBeInTheDocument();
    // The 1+N fan-out the create form used to do is gone: two requests answer
    // every row, whatever the family count.
    expect(fannedOut).not.toHaveBeenCalled();
  });

  it("lists a family with no active occasion, disabled, with the reason", async () => {
    // Rule 6 in draft: hiding it recreates the "why can't I share with Work
    // Friends?" question the row exists to answer.
    serveDraft();

    renderDraft();

    const box = await screen.findByRole("checkbox", { name: /share with work friends/i });
    expect(box).toBeDisabled();
    expect(screen.getByText(/no active occasion/i)).toBeInTheDocument();
  });

  it("hands the caller the intended selection when a family is ticked", async () => {
    serveDraft();

    const { onChange } = renderDraft();

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with the boones/i }));

    expect(onChange).toHaveBeenCalledWith({ familyOccasions: { 7: 70 }, userIds: [] });
  });

  it("refuses a family with several occasions until one is chosen", async () => {
    serveDraft();

    const { onChange } = renderDraft();

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with the smiths/i }));
    expect(screen.getByText(/choose an occasion to share with the smiths/i)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /occasion for the smiths/i }),
      "81",
    );
    await userEvent.click(screen.getByRole("checkbox", { name: /share with the smiths/i }));

    expect(onChange).toHaveBeenCalledWith({ familyOccasions: { 8: 81 }, userIds: [] });
  });

  it("unticking a family drops it from the selection", async () => {
    serveDraft();

    const { onChange } = renderDraft({ familyOccasions: { 7: 70 }, userIds: [] });

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with the boones/i }));

    expect(onChange).toHaveBeenCalledWith({ familyOccasions: {}, userIds: [] });
  });

  it("offers the people the create form never had, and ticks them", async () => {
    serveDraft();

    const { onChange } = renderDraft();

    await userEvent.click(await screen.findByRole("checkbox", { name: /share with bob/i }));

    expect(onChange).toHaveBeenCalledWith({ familyOccasions: {}, userIds: [3] });
  });

  it("leaves every person live while a family that would cover them is ticked", async () => {
    // No coverage disable while creating: nobody is covered until the list
    // exists, and a row going dead and live again under the cursor as families
    // are ticked mid-form would be worse than no nudge at all.
    serveDraft();

    renderDraft({ familyOccasions: { 7: 70 }, userIds: [] });

    expect(await screen.findByRole("checkbox", { name: /share with alice/i })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: /share with bob/i })).toBeEnabled();
    expect(screen.queryByText(/already sees this/i)).not.toBeInTheDocument();
  });

  it("says an empty section is empty without offering a way off the form", async () => {
    serveDraft({ people: [] });
    server.use(http.get(`${API}/families`, () => HttpResponse.json([])));

    renderDraft();

    expect(await screen.findByText(/don't belong to any families yet/i)).toBeInTheDocument();
    expect(screen.getByText(/don't have any connections yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("waits for both reads before saying a family has no active occasion", async () => {
    // A row whose occasions have not arrived must not say "no active occasion"
    // — that reads as a fact about the family rather than about the request.
    server.use(
      http.get(`${API}/families`, () => HttpResponse.json(families)),
      http.get(`${API}/occasions`, () => new Promise(() => {})),
      http.get(`${API}/connections`, () => HttpResponse.json(connections)),
    );

    renderDraft();

    expect(await screen.findByRole("dialog", { name: "Who can see this list" })).toBeInTheDocument();
    expect(screen.queryByText(/no active occasion/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: /share with work friends/i }),
    ).not.toBeInTheDocument();
  });

  it("counts the draft's own ticks in the shared-with line", async () => {
    serveDraft();

    renderDraft({ familyOccasions: { 7: 70 }, userIds: [2, 3] });

    await waitFor(() =>
      expect(screen.getByText("Shared with 1 family and 2 people")).toBeInTheDocument(),
    );
  });
});
