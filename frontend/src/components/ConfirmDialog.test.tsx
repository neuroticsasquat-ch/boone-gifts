import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ConfirmDialog, type ConfirmAction } from "./ConfirmDialog";

const DELETE: ConfirmAction[] = [{ id: "delete", label: "Delete", tone: "danger" }];

function renderDialog(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onResolve = vi.fn();
  render(
    <>
      <button>Behind the dialog</button>
      <ConfirmDialog
        open
        title="Delete this list?"
        actions={DELETE}
        onResolve={onResolve}
        {...props}
      />
    </>
  );
  return { onResolve };
}

/** A trigger that opens the dialog, so focus has somewhere real to return to. */
function TriggerAndDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Delete list</button>
      <ConfirmDialog
        open={open}
        title="Delete this list?"
        actions={DELETE}
        onResolve={() => setOpen(false)}
      />
    </>
  );
}

describe("ConfirmDialog", () => {
  it("renders nothing when closed", () => {
    renderDialog({ open: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders actions in array order, before Cancel", () => {
    renderDialog({
      actions: [
        { id: "release", label: "Release those claims", tone: "primary" },
        { id: "keep", label: "Keep them claimed", tone: "neutral" },
      ],
    });

    const labels = screen
      .getAllByRole("button")
      .filter((button) => screen.getByRole("dialog").contains(button))
      .map((button) => button.textContent);
    expect(labels).toEqual(["Release those claims", "Keep them claimed", "Cancel"]);
  });

  it("resolves the chosen action's id", async () => {
    const user = userEvent.setup();
    const { onResolve } = renderDialog({
      actions: [
        { id: "release", label: "Release those claims", tone: "primary" },
        { id: "keep", label: "Keep them claimed", tone: "neutral" },
      ],
    });

    await user.click(screen.getByRole("button", { name: "Keep them claimed" }));

    expect(onResolve).toHaveBeenCalledExactlyOnceWith("keep");
  });

  it("resolves null when Cancel is pressed", async () => {
    const user = userEvent.setup();
    const { onResolve } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onResolve).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("resolves null when Escape is pressed", async () => {
    const user = userEvent.setup();
    const { onResolve } = renderDialog();

    await user.keyboard("{Escape}");

    expect(onResolve).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("renders no paragraph when there is no body", () => {
    const { container } = render(
      <ConfirmDialog open title="Archive this list?" actions={DELETE} onResolve={vi.fn()} />
    );

    expect(container.querySelector("p")).toBeNull();
  });

  it("renders the body when one is given", () => {
    renderDialog({ body: "This cannot be undone." });

    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
  });

  it("is labelled by its title", () => {
    renderDialog();

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Delete this list?");
  });

  it("moves focus into the dialog when it opens", async () => {
    const user = userEvent.setup();
    render(<TriggerAndDialog />);

    await user.click(screen.getByRole("button", { name: "Delete list" }));

    expect(screen.getByRole("button", { name: "Delete" })).toHaveFocus();
  });

  it("returns focus to the trigger when it closes", async () => {
    const user = userEvent.setup();
    render(<TriggerAndDialog />);
    const trigger = screen.getByRole("button", { name: "Delete list" });

    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("cycles Tab within the dialog and never reaches the page behind it", async () => {
    const user = userEvent.setup();
    renderDialog();
    const confirm = screen.getByRole("button", { name: "Delete" });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const behind = screen.getByRole("button", { name: "Behind the dialog" });

    confirm.focus();
    await user.tab();
    expect(cancel).toHaveFocus();

    await user.tab();
    expect(confirm).toHaveFocus();
    expect(behind).not.toHaveFocus();
  });

  it("cycles Shift-Tab within the dialog and never reaches the page behind it", async () => {
    const user = userEvent.setup();
    renderDialog();
    const confirm = screen.getByRole("button", { name: "Delete" });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const behind = screen.getByRole("button", { name: "Behind the dialog" });

    confirm.focus();
    await user.tab({ shift: true });
    expect(cancel).toHaveFocus();

    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
    expect(behind).not.toHaveFocus();
  });

  it("pulls focus back in when it has strayed outside the dialog", async () => {
    const user = userEvent.setup();
    renderDialog();
    const behind = screen.getByRole("button", { name: "Behind the dialog" });

    behind.focus();
    await user.tab();

    expect(screen.getByRole("button", { name: "Delete" })).toHaveFocus();
  });

  it("disables every button including Cancel while pending", () => {
    renderDialog({ pending: true });

    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("does not resolve on Escape while pending", async () => {
    const user = userEvent.setup();
    const { onResolve } = renderDialog({ pending: true });

    await user.keyboard("{Escape}");

    expect(onResolve).not.toHaveBeenCalled();
  });

  // The one behaviour the `Modal` shell added in NEU-1306: the backdrop is the
  // peer of the Escape this dialog already had, and is stopped by the same
  // `pending` guard rather than becoming a second way out mid-mutation.
  it("resolves null on a backdrop click", async () => {
    const user = userEvent.setup();
    const { onResolve } = renderDialog();

    await user.click(screen.getByRole("dialog").parentElement!);

    expect(onResolve).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("does not resolve on a backdrop click while pending", async () => {
    const user = userEvent.setup();
    const { onResolve } = renderDialog({ pending: true });

    await user.click(screen.getByRole("dialog").parentElement!);

    expect(onResolve).not.toHaveBeenCalled();
  });
});
