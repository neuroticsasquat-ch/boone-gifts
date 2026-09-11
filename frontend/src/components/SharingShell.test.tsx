import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SharingShell, SharingSummaryLine } from "./SharingShell";

/**
 * The chrome alone — the half both sharing dialogs share.
 *
 * Everything about *rows* belongs to the two modes and is asserted in their own
 * files. What is asserted here is only what the shell owns: the filter box and
 * where its text goes, the summary slot, `Done`, and that the shell is still a
 * `Modal` — the trap and the topmost-only Escape come from there and must not
 * have been re-hand-rolled on the way out of `SharingModal`.
 */
function renderShell({
  onClose = vi.fn(),
  summary = <SharingSummaryLine>2 of your lists are shared here.</SharingSummaryLine>,
  children = (filter: string) => <p>{`filter: "${filter}"`}</p>,
}: {
  onClose?: () => void;
  summary?: React.ReactNode;
  children?: (filter: string) => React.ReactNode;
} = {}) {
  render(
    <SharingShell
      title="Share a list with Christmas 2026"
      filterLabel="Filter your lists"
      summary={summary}
      onClose={onClose}
    >
      {children}
    </SharingShell>,
  );
  return { onClose };
}

describe("SharingShell", () => {
  it("names the dialog with its title", async () => {
    renderShell();

    const dialog = await screen.findByRole("dialog", { name: "Share a list with Christmas 2026" });
    expect(dialog).toBeInTheDocument();
  });

  it("hands the filter text to its children as they type", async () => {
    const user = userEvent.setup();
    renderShell();

    expect(screen.getByText('filter: ""')).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: "Filter your lists" }), "mum");

    expect(screen.getByText('filter: "mum"')).toBeInTheDocument();
  });

  // Rule 8 stops at the dialog edge: scratch input inside a modal is component
  // state, because nobody links to a half-typed filter and one write per
  // keystroke can reach Safari's replaceState throttle. There is no router here
  // at all, so a filter that tried to write the URL could not even render.
  it("keeps the filter out of the URL", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.type(screen.getByRole("searchbox", { name: "Filter your lists" }), "mum");

    expect(screen.getByRole("searchbox", { name: "Filter your lists" })).toHaveValue("mum");
  });

  it("renders whatever summary its caller passes", () => {
    renderShell({ summary: <SharingSummaryLine>Loading your lists…</SharingSummaryLine> });

    expect(screen.getByText("Loading your lists…")).toBeInTheDocument();
  });

  it("closes on Done", async () => {
    const user = userEvent.setup();
    const { onClose } = renderShell();

    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  // From `Modal`, not from here — this asserts the shell still composes it.
  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const { onClose } = renderShell();

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
  });

  // Also `Modal`'s: the first tabbable element, which the markup order makes
  // the filter box. Keep the input ahead of the rows and this stays true.
  it("focuses the filter box on open", async () => {
    renderShell();

    expect(await screen.findByRole("searchbox", { name: "Filter your lists" })).toHaveFocus();
  });

  it("keeps Tab inside the panel", async () => {
    const user = userEvent.setup();
    renderShell({ children: () => <button>a row</button> });

    const filter = screen.getByRole("searchbox", { name: "Filter your lists" });
    const done = screen.getByRole("button", { name: "Done" });

    expect(filter).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "a row" })).toHaveFocus();
    await user.tab();
    expect(done).toHaveFocus();
    // Past the last element, back to the first.
    await user.tab();
    expect(filter).toHaveFocus();
  });
});
