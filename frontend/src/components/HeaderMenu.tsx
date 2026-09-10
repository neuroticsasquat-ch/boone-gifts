import { useEffect, useRef, useState } from "react";

export type HeaderMenuItem = {
  label: string;
  onClick: () => void;
  danger?: boolean;
  separatorBefore?: boolean;
};

/**
 * A page header's `⋯` menu, so the header can lead with the thing itself rather
 * than with its controls. List detail's owner menu holds the folder action plus
 * edit, archive and delete; a viewer's holds the folder action alone; the
 * occasion page's holds rename and archive for an organizer.
 *
 * `ariaLabel` names *what* the menu acts on ("List actions", "Occasion
 * actions"), because a page may hold more than one and "More actions" would
 * tell a screen-reader user nothing about which.
 */
export function HeaderMenu({
  items,
  ariaLabel,
  pending = false,
}: {
  items: HeaderMenuItem[];
  ariaLabel: string;
  pending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Focus goes back to `⋯` before the action runs, not after: choosing an item
  // unmounts it, and an action that opens a ConfirmDialog captures whatever is
  // focused at that moment as the element to restore to when the dialog closes.
  // Without this the capture lands on `<body>` and the focus return is lost.
  function run(action: () => void) {
    triggerRef.current?.focus();
    setOpen(false);
    action();
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        disabled={pending}
        aria-label={ariaLabel}
        aria-expanded={open}
        className="rounded px-3 py-1 text-lg font-medium leading-none text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50"
      >
        &#8943;
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-52 rounded-lg bg-white py-1 shadow-lg ring-1 ring-black/5">
          {items.map((item) => (
            <div key={item.label}>
              {item.separatorBefore && <hr className="my-1 border-gray-100" />}
              <button
                onClick={() => run(item.onClick)}
                className={`block w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${
                  item.danger ? "text-red-600" : "text-gray-700"
                }`}
              >
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
