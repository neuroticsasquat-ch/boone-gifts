import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ActionBar, type ActionBarItem } from "./ActionBar";
import { mockViewport } from "../test/viewport";

/**
 * The component's own contract. What it is *for* — that no action in the app
 * hides behind a glyph — is `action-policy.test.tsx`'s job; this file only
 * proves the bar keeps the promises those call sites rely on.
 *
 * Every case below runs at the suite's default desktop width unless it calls
 * `mockViewport("mobile")` first.
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

  // Nothing to open, so nothing to say is open — and without the opt-in below,
  // that is still true at every width.
  it("has no disclosure state of its own", () => {
    renderBar([{ label: "Edit", onClick: vi.fn() }]);

    const button = screen.getByRole("button", { name: "Edit" });
    expect(button).not.toHaveAttribute("aria-expanded");
    expect(button).toHaveAttribute("type", "button");
  });
});

/**
 * The width exception (ADR 0010): a header carrying a *group* of actions may
 * collapse them behind a labelled disclosure below `md`. Which call sites are
 * allowed to is `action-policy.test.tsx`'s business — this block is only about
 * what the prop does when it is passed.
 */
describe("ActionBar — collapseOnMobile", () => {
  function actions(): ActionBarItem[] {
    return [
      { label: "Sharing…", onClick: vi.fn() },
      { label: "Delete", onClick: vi.fn(), tone: "danger" },
      { label: "Edit", onClick: vi.fn() },
    ];
  }

  function open() {
    return screen.getByRole("button", { name: "Actions" });
  }

  it("changes nothing at either width when the prop is absent", () => {
    const desktop = render(<ActionBar items={actions()} />);
    mockViewport("mobile");
    const mobile = render(<ActionBar items={actions()} />);

    expect(mobile.container.innerHTML).toBe(desktop.container.innerHTML);
  });

  it("is an ordinary bar at md and up, prop or no prop", () => {
    render(<ActionBar collapseOnMobile items={actions()} />);

    expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument();
    expect(labels()).toEqual(["Sharing…", "Edit", "Delete"]);
  });

  it("collapses below md to one labelled, unexpanded control", () => {
    mockViewport("mobile");
    render(<ActionBar collapseOnMobile items={actions()} />);

    expect(open()).toHaveAttribute("aria-expanded", "false");
    // Not merely invisible — out of the document, so nothing reaches them by
    // tab order or by accessible name either.
    for (const name of ["Sharing…", "Edit", "Delete"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    // The finding ADR 0009 keeps, narrowed by ADR 0011: a word *and* a glyph,
    // never a glyph alone. Still an exact match, so a future trigger that lost
    // the word — or grew a second one — fails here rather than sliding past a
    // substring.
    expect(open().textContent).toBe("Actions ⌄");
  });

  it("reveals every action, in order and in tone, on one press", async () => {
    mockViewport("mobile");
    render(<ActionBar collapseOnMobile items={actions()} />);

    await userEvent.click(open());

    expect(open()).toHaveAttribute("aria-expanded", "true");
    // Danger is still last and still an outline; the panel is the same bar.
    expect(labels()).toEqual(["Actions ⌃", "Sharing…", "Edit", "Delete"]);
    for (const name of ["Sharing…", "Edit", "Delete"]) {
      expect(screen.getByRole("button", { name })).toBeEnabled();
    }
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("border-red-600");
  });

  // Not a preference: `ConfirmDialog` captures the focused element as what to
  // return focus to, so a panel that closed on click would unmount the button
  // it has to restore to — the exact bug ADR 0009 deleted the focus dance to
  // avoid. The panel closes on its trigger and on nothing else.
  it("stays open when an action inside it is triggered", async () => {
    mockViewport("mobile");
    const edit = vi.fn();
    render(<ActionBar collapseOnMobile items={[{ label: "Edit", onClick: edit }]} />);

    await userEvent.click(open());
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(edit).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(open()).toHaveAttribute("aria-expanded", "true");
  });

  it("closes when the trigger is pressed again", async () => {
    mockViewport("mobile");
    render(<ActionBar collapseOnMobile items={actions()} />);

    await userEvent.click(open());
    await userEvent.click(open());

    expect(open()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  // ADR 0011. The trigger says two things the buttons do not: that it opens, and
  // that it is not one of them.
  it("names itself with the word alone — the chevron is decoration", () => {
    mockViewport("mobile");
    render(<ActionBar collapseOnMobile items={actions()} />);

    // `aria-expanded` already states the same fact, and a screen reader must not
    // hear it twice — so the glyph must not reach the accessible name.
    expect(open()).toHaveAccessibleName("Actions");
    expect(open().querySelector("[aria-hidden='true']")).toHaveTextContent("⌄");
  });

  it("flips the chevron with the state it announces", async () => {
    mockViewport("mobile");
    render(<ActionBar collapseOnMobile items={actions()} />);

    const chevron = () => open().querySelector("[aria-hidden='true']");
    expect(chevron()).toHaveTextContent("⌄");
    expect(open()).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(open());

    expect(chevron()).toHaveTextContent("⌃");
    expect(open()).toHaveAttribute("aria-expanded", "true");
    // The word never goes anywhere, at either state.
    expect(open()).toHaveAccessibleName("Actions");
  });

  // The complaint itself: the control that *opens* the bar wore byte-for-byte
  // the treatment of the five it hides. Asserted against a button in the same
  // bar rather than against class literals, so restyling both together cannot
  // silently pass this.
  it("wears neither the border nor the fill of the buttons it reveals", async () => {
    mockViewport("mobile");
    render(<ActionBar collapseOnMobile items={actions()} />);

    await userEvent.click(open());
    const action = screen.getByRole("button", { name: "Edit" });

    for (const chrome of ["border", "bg-"]) {
      expect(action.className).toContain(chrome);
      expect(open().className).not.toContain(chrome);
    }
  });

  // The whole-bar rule, inside the panel: two mutations must never race on the
  // same object, and reaching a second one through the trigger is still
  // reaching it.
  it("disables the panel and its trigger while any item is pending", async () => {
    mockViewport("mobile");
    const bar = (pending: boolean) => (
      <ActionBar
        collapseOnMobile
        items={[
          { label: "Edit", onClick: vi.fn() },
          { label: "Archive", onClick: vi.fn(), pending, pendingLabel: "Archiving…" },
        ]}
      />
    );
    const { rerender } = render(bar(false));

    await userEvent.click(open());
    rerender(bar(true));

    for (const name of ["Actions", "Edit", "Archiving…"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    // The panel does not slam shut under the user mid-mutation; it is disabled,
    // which is what the open bar does too.
    expect(open()).toHaveAttribute("aria-expanded", "true");
  });
});
