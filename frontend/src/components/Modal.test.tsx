import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Modal } from "./Modal";

/** The shell with a heading of its own, as every caller supplies one. */
function Dialog({
  open = true,
  onClose = vi.fn(),
  children,
}: {
  open?: boolean;
  onClose?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Modal open={open} labelledBy="title" onClose={onClose}>
      <h2 id="title">Who can see this list</h2>
      {children ?? (
        <>
          <button>First</button>
          <button>Last</button>
        </>
      )}
    </Modal>
  );
}

function renderModal(props: Partial<React.ComponentProps<typeof Dialog>> = {}) {
  const onClose = vi.fn();
  render(
    <>
      <button>Behind the dialog</button>
      <Dialog onClose={onClose} {...props} />
    </>
  );
  return { onClose };
}

describe("Modal", () => {
  it("renders nothing when closed", () => {
    renderModal({ open: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is a modal dialog named by the element the caller points at", () => {
    renderModal();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Who can see this list");
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on a backdrop click, but not on a click inside the panel", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.click(screen.getByRole("button", { name: "First" }));
    expect(onClose).not.toHaveBeenCalled();

    // The backdrop is the dialog's parent: the fixed layer it is centred in.
    await user.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("moves focus to the first tabbable element on open", () => {
    renderModal();

    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
  });

  it("returns focus to whatever opened it", async () => {
    const user = userEvent.setup();
    function TriggerAndModal() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Change</button>
          <Dialog open={open} onClose={() => setOpen(false)} />
        </>
      );
    }
    render(<TriggerAndModal />);
    const trigger = screen.getByRole("button", { name: "Change" });

    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("cycles Tab within the panel and never reaches the page behind it", async () => {
    const user = userEvent.setup();
    renderModal();
    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });

    await user.tab();
    expect(last).toHaveFocus();
    await user.tab();
    expect(first).toHaveFocus();
    expect(screen.getByRole("button", { name: "Behind the dialog" })).not.toHaveFocus();
  });

  it("cycles Shift-Tab within the panel too", async () => {
    const user = userEvent.setup();
    renderModal();
    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });

    await user.tab({ shift: true });
    expect(last).toHaveFocus();
    await user.tab({ shift: true });
    expect(first).toHaveFocus();
  });

  it("pulls focus back in when it has strayed outside the panel", async () => {
    const user = userEvent.setup();
    renderModal();

    screen.getByRole("button", { name: "Behind the dialog" }).focus();
    await user.tab();

    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
  });
});

/**
 * Two modals are mounted at once whenever a revoke needs confirming over the
 * sharing modal. Both handlers listen on `document`, so without the stack
 * Escape resolves both and the outer trap fights the inner one.
 */
describe("Modal — stacked, topmost only", () => {
  function Stacked({
    innerOpen,
    onOuterClose,
    onInnerClose,
  }: {
    innerOpen: boolean;
    onOuterClose: () => void;
    onInnerClose: () => void;
  }) {
    return (
      <>
        <Modal open labelledBy="outer" onClose={onOuterClose}>
          <h2 id="outer">Who can see this list</h2>
          <button>Outer</button>
        </Modal>
        <Modal open={innerOpen} labelledBy="inner" onClose={onInnerClose}>
          <h2 id="inner">Some gifts are claimed</h2>
          <button>Release</button>
          <button>Keep</button>
        </Modal>
      </>
    );
  }

  function renderStacked(innerOpen = true) {
    const onOuterClose = vi.fn();
    const onInnerClose = vi.fn();
    render(
      <Stacked innerOpen={innerOpen} onOuterClose={onOuterClose} onInnerClose={onInnerClose} />
    );
    return { onOuterClose, onInnerClose };
  }

  it("resolves only the topmost on Escape", async () => {
    const user = userEvent.setup();
    const { onOuterClose, onInnerClose } = renderStacked();

    await user.keyboard("{Escape}");

    expect(onInnerClose).toHaveBeenCalledOnce();
    expect(onOuterClose).not.toHaveBeenCalled();
  });

  it("traps Tab in the topmost, leaving the one beneath it alone", async () => {
    const user = userEvent.setup();
    renderStacked();
    const release = screen.getByRole("button", { name: "Release" });
    const keep = screen.getByRole("button", { name: "Keep" });

    expect(release).toHaveFocus();
    await user.tab();
    expect(keep).toHaveFocus();
    await user.tab();
    expect(release).toHaveFocus();
    expect(screen.getByRole("button", { name: "Outer" })).not.toHaveFocus();
  });

  it("hands the keyboard back when the topmost unmounts", async () => {
    // The stack has to shrink on unmount, or the outer modal is left deaf for
    // the rest of its life.
    const user = userEvent.setup();
    const onOuterClose = vi.fn();
    const onInnerClose = vi.fn();
    const { rerender } = render(
      <Stacked innerOpen onOuterClose={onOuterClose} onInnerClose={onInnerClose} />
    );

    rerender(
      <Stacked innerOpen={false} onOuterClose={onOuterClose} onInnerClose={onInnerClose} />
    );
    await user.keyboard("{Escape}");

    expect(onOuterClose).toHaveBeenCalledOnce();
  });
});
