import { useEffect, useId, useRef } from "react";

const TABBABLE = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * The two panel shapes this app's modals come in.
 *
 * `size` is what lets one shell serve both callers without either reaching into
 * the other's layout: a confirmation is two sentences and three buttons, so it
 * is content-sized and pads itself; the sharing modal is a column of ~58 rows,
 * so it is capped at the viewport and scrolls its middle between a fixed header
 * and a fixed footer — which means the panel itself must not scroll.
 */
const SIZE_CLASSES = {
  md: "max-w-md p-6",
  lg: "flex max-h-[85vh] max-w-lg flex-col overflow-hidden",
} as const;

/**
 * Every open modal, outermost first.
 *
 * Two are mounted at once whenever a revoke needs confirming over the sharing
 * modal, and both the Escape handler and the Tab trap listen on `document`.
 * Without a stack, Escape would resolve *both* dialogs, and the outer trap —
 * whose check is "is focus inside my panel?" — would see focus sitting in the
 * inner one, call that a stray, and yank it back on the first Tab. Only the
 * last token acts on a key; every future stacking pair inherits that.
 *
 * Module-level rather than a context, because the rule is about the document's
 * one keyboard and not about any subtree.
 *
 * Order comes from mount order, since the push happens in an effect. Siblings
 * and a later-opened child both land the right way up — a revoke confirm always
 * mounts after the sharing modal, because `pendingRevoke` starts `null`. A
 * modal that mounted a *nested* one already open on its own first render would
 * push child-first and invert the stack; nothing does that today, and a caller
 * that wants to should open the inner one a tick later instead.
 */
const stack: string[] = [];

/**
 * The app's modal shell: the backdrop, the z-index, `role="dialog"`, the focus
 * trap, Escape, the backdrop click and focus return. Hand-rolled on a div
 * rather than a native `<dialog>`, because jsdom 30 implements only the `open`
 * property — the behaviours below are ours precisely so they can be asserted
 * rather than assumed. See ADR 0008 and its NEU-1306 amendment.
 *
 * The caller owns its own heading and passes `labelledBy`, so each keeps its
 * own layout while the shell keeps the accessible name.
 */
export function Modal({
  open,
  labelledBy,
  size = "md",
  onClose,
  children,
}: {
  open: boolean;
  labelledBy: string;
  size?: keyof typeof SIZE_CLASSES;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const token = useId();

  useEffect(() => {
    if (!open) return;
    stack.push(token);
    return () => {
      const at = stack.lastIndexOf(token);
      if (at !== -1) stack.splice(at, 1);
    };
  }, [open, token]);

  // Focus moves into the dialog on open and back to whatever opened it on
  // close — including an unmount, which is how most call sites close it. The
  // first tabbable element is the rule: a confirmation opens on its primary
  // action, and the sharing modal opens on the filter box because that is what
  // its markup puts first.
  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>(TABBABLE)?.focus();
    return () => triggerRef.current?.focus();
  }, [open]);

  // Escape and the Tab cycle are listened for on the document, so a stray focus
  // outside the panel is pulled back in rather than escaping the trap.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      // Topmost only. A modal underneath another one is scenery: it does not
      // read the keyboard, and it does not move focus.
      if (stack[stack.length - 1] !== token) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(TABBABLE) ?? []);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!active || !panelRef.current?.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, token, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      // The backdrop and nothing inside it: a click that started on a row and
      // drifted is still a click on the row.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`w-full rounded-lg bg-white shadow-lg ${SIZE_CLASSES[size]}`}
      >
        {children}
      </div>
    </div>
  );
}
