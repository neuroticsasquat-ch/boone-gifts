/**
 * The tab bar the occasion and folder pages share — **Lists · My shopping** on
 * both (project spec §9.2, §9.3).
 *
 * It is one component rather than one per page because "the same two-tab shape"
 * is the requirement, not a coincidence: the two pages are the same object seen
 * through a family's occasion and through a user's own folder, and a bar that
 * drifted on one of them would read as a different kind of page.
 *
 * The caller owns the active key, so a page can name its own panels; this
 * renders the buttons and their `tablist`/`tab` semantics and nothing else.
 */
export function TabBar<K extends string>({
  tabs,
  active,
  onSelect,
  label,
}: {
  tabs: readonly { readonly key: K; readonly label: string }[];
  active: K;
  onSelect: (key: K) => void;
  /** Names the bar for a screen reader — "Occasion sections", "Folder sections". */
  label: string;
}) {
  return (
    <div className="flex gap-3" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={active === tab.key}
          onClick={() => onSelect(tab.key)}
          className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
            active === tab.key
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
