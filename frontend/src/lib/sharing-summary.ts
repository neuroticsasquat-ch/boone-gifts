/**
 * The sentences the sharing surfaces say about who a list reaches, stated once.
 *
 * Two surfaces say them now — the dialog's own line and the create form's
 * section under `Who can see this list` (NEU-1307) — and a list that reaches
 * nobody has to read identically in both, because "This list isn't shared with
 * anyone." is the mitigation for there being no auto-grant (project spec §8)
 * rather than decoration.
 */

/** `2 families`, `1 person` — the unit named, and pluralised with the count. */
function counted(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * What is ticked, counted rather than named.
 *
 * A true headcount was rejected: it would count people the owner has never met
 * and cannot name, and it moves when someone joins a family without the owner
 * touching anything. The list header's `SharingSummary` already **names**
 * everyone; this counts.
 */
export function sharedWithSentence(families: number, people: number): string {
  const units = [
    ...(families > 0 ? [counted(families, "family", "families")] : []),
    ...(people > 0 ? [counted(people, "person", "people")] : []),
  ];
  return units.length === 0
    ? "This list isn't shared with anyone."
    : `Shared with ${units.join(" and ")}`;
}

/** `The Boones`, `The Boones and The Smiths`, `A, B and C` — names in prose,
 *  for a reason line or a failure that has to name who it means. */
export function joinNames(names: string[]): string {
  if (names.length < 2) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
