import { useEffect, useId, useRef } from "react";

/**
 * One way out of the dialog. `Cancel` is always rendered and is never listed
 * here — it resolves `null`, which is what every caller treats as "do nothing".
 */
export type ConfirmAction = {
  id: string;
  label: string;
  tone: "danger" | "primary" | "neutral";
};

const TONE_CLASSES: Record<ConfirmAction["tone"], string> = {
  danger: "bg-red-600 text-white hover:bg-red-700",
  primary: "bg-blue-600 text-white hover:bg-blue-700",
  neutral: "bg-gray-200 text-gray-700 hover:bg-gray-300",
};

const TABBABLE = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * The app's only confirmation dialog. Hand-rolled on a `role="dialog"` div
 * rather than a native `<dialog>`, because jsdom 30 implements only the `open`
 * property — the trap, Escape and focus-return below are ours precisely so
 * they can be asserted rather than assumed. See ADR 0008.
 *
 * Driven declaratively, not as a promise: the caller holds its own "what am I
 * confirming" state and passes `pending`, so the dialog can stay open with
 * every button disabled while the mutation it triggered is in flight.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  actions,
  pending = false,
  onResolve,
}: {
  open: boolean;
  title: string;
  body?: React.ReactNode;
  actions: ConfirmAction[];
  pending?: boolean;
  onResolve: (id: string | null) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // Focus moves into the dialog on open and back to whatever opened it on
  // close — including an unmount, which is how most call sites close it.
  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>(TABBABLE)?.focus();
    return () => triggerRef.current?.focus();
  }, [open]);

  // Escape and the Tab cycle are listened for on the document, so a stray
  // focus outside the panel is pulled back in rather than escaping the trap.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // `pending` disables every button including Cancel; Escape is a way
        // out too, and closing mid-mutation is the regression ADR 0008 guards.
        if (pending) return;
        event.preventDefault();
        onResolve(null);
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
  }, [open, pending, onResolve]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg"
      >
        <h2 id={titleId} className="text-lg font-semibold text-gray-900">
          {title}
        </h2>
        {body !== undefined && <p className="mt-2 text-sm text-gray-600">{body}</p>}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => onResolve(action.id)}
              disabled={pending}
              className={`rounded px-4 py-2 text-sm font-medium disabled:opacity-50 ${TONE_CLASSES[action.tone]}`}
            >
              {action.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onResolve(null)}
            disabled={pending}
            className="rounded px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
