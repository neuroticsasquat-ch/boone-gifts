import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ActionBar, type ActionBarItem } from "./ActionBar";

/**
 * The component's own contract. What it is *for* — that no action in the app
 * hides behind a glyph — is `action-policy.test.tsx`'s job; this file only
 * proves the bar keeps the promises those call sites rely on.
 */

function renderBar(items: ActionBarItem[]) {
  return render(<ActionBar items={items} />);
}

/** The bar's buttons, in the order they are rendered. */
function labels() {
  return screen.getAllByRole("button").map((b) => b.textContent);
}

describe("ActionBar", () => {
  it("renders every item as a button that needs no prior interaction", async () => {
    const edit = vi.fn();
    renderBar([
      { label: "Edit", onClick: edit },
      { label: "Archive", onClick: vi.fn() },
    ]);

    const button = screen.getByRole("button", { name: "Edit" });
    expect(button).toBeEnabled();

    await userEvent.click(button);

    expect(edit).toHaveBeenCalledOnce();
  });

  it("defaults an item with no tone to neutral", () => {
    renderBar([{ label: "Edit", onClick: vi.fn() }]);

    const button = screen.getByRole("button", { name: "Edit" });
    expect(button).toHaveClass("bg-gray-200");
    expect(button).not.toHaveClass("border-red-600");
  });

  // The restraint the ⋯ existed to buy, bought by treatment instead: a danger
  // action is outlined, never the solid fill the dialog's own Delete carries.
  it("gives danger an outline rather than a fill", () => {
    renderBar([{ label: "Delete", onClick: vi.fn(), tone: "danger" }]);

    const button = screen.getByRole("button", { name: "Delete" });
    expect(button).toHaveClass("border-red-600", "text-red-700");
    expect(button.className).not.toMatch(/bg-red-600/);
  });

  // `HeaderMenu`'s `separatorBefore` always meant exactly this: it was set once,
  // to fence Delete off from the rest.
  it("puts danger actions last, whatever order they were given in", () => {
    renderBar([
      { label: "Delete", onClick: vi.fn(), tone: "danger" },
      { label: "Edit", onClick: vi.fn() },
      { label: "Archive", onClick: vi.fn() },
    ]);

    expect(labels()).toEqual(["Edit", "Archive", "Delete"]);
  });

  it("sets the wider gap on the first danger action only", () => {
    renderBar([
      { label: "Edit", onClick: vi.fn() },
      { label: "Remove", onClick: vi.fn(), tone: "danger" },
      { label: "Delete", onClick: vi.fn(), tone: "danger" },
    ]);

    expect(screen.getByRole("button", { name: "Edit" })).not.toHaveClass("ml-2");
    expect(screen.getByRole("button", { name: "Remove" })).toHaveClass("ml-2");
    expect(screen.getByRole("button", { name: "Delete" })).not.toHaveClass("ml-2");
  });

  it("wraps rather than scrolling or truncating", () => {
    const { container } = renderBar([{ label: "Edit", onClick: vi.fn() }]);

    const bar = container.firstElementChild as HTMLElement;
    expect(bar).toHaveClass("flex", "flex-wrap");
    expect(bar.className).not.toMatch(/overflow|truncate|whitespace-nowrap/);
  });

  // The menu got this free: with it shut, disabling the trigger disabled
  // everything. Four separately clickable buttons do not, and two mutations
  // must never race on the same object.
  it("disables every button while any one item is pending", () => {
    renderBar([
      { label: "Edit", onClick: vi.fn() },
      { label: "Archive", onClick: vi.fn(), pending: true },
      { label: "Delete", onClick: vi.fn(), tone: "danger" },
    ]);

    for (const name of ["Edit", "Archive…", "Delete"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
  });

  it("gives the pending item a busy label and leaves the others alone", () => {
    renderBar([
      { label: "Edit", onClick: vi.fn() },
      { label: "Archive", onClick: vi.fn(), pending: true, pendingLabel: "Archiving…" },
    ]);

    expect(labels()).toEqual(["Edit", "Archiving…"]);
  });

  it("falls back to `${label}…` when no pendingLabel is given", () => {
    renderBar([{ label: "Remove", onClick: vi.fn(), pending: true }]);

    expect(labels()).toEqual(["Remove…"]);
  });

  // A row's action names its subject while its visible text stays short. The
  // accessible name *contains* the visible label, so voice control still works
  // on "click Remove" (WCAG 2.5.3 Label in Name).
  it("lets ariaLabel override the accessible name while the text stays short", () => {
    renderBar([
      { label: "Remove", onClick: vi.fn(), tone: "danger", ariaLabel: "Remove Jane Boone" },
    ]);

    const button = screen.getByRole("button", { name: "Remove Jane Boone" });
    expect(within(button).getByText("Remove")).toBeInTheDocument();
    expect(button).toHaveAccessibleName("Remove Jane Boone");
  });

  it("leaves the accessible name to the visible text when no ariaLabel is given", () => {
    renderBar([{ label: "Edit", onClick: vi.fn() }]);

    expect(screen.getByRole("button", { name: "Edit" })).not.toHaveAttribute("aria-label");
  });

  // Nothing to open, so nothing to say is open.
  it("has no disclosure state of its own", () => {
    renderBar([{ label: "Edit", onClick: vi.fn() }]);

    const button = screen.getByRole("button", { name: "Edit" });
    expect(button).not.toHaveAttribute("aria-expanded");
    expect(button).toHaveAttribute("type", "button");
  });
});
