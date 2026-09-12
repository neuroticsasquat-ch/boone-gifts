import { useCallback, useId } from "react";
import { Modal } from "./Modal";

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

/**
 * The app's only confirmation dialog, and since NEU-1306 one of two callers of
 * `Modal` — which owns the backdrop, the trap, Escape and focus return that
 * used to live here. Its own shape is unchanged: `max-w-md`, content-sized,
 * title then body then the action row (ADR 0008, amended).
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
  const titleId = useId();

  // `pending` disables every button including Cancel; Escape and the backdrop
  // are ways out too, so they are stopped by the same guard — closing
  // mid-mutation is the regression ADR 0008 exists to prevent.
  const close = useCallback(() => {
    if (!pending) onResolve(null);
  }, [pending, onResolve]);

  return (
    <Modal open={open} labelledBy={titleId} onClose={close}>
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
    </Modal>
  );
}
