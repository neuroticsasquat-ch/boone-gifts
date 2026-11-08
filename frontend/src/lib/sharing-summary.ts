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

/**
 * How many of the viewer's **own** lists already reach one occasion, for the
 * occasion dialog's summary line (NEU-1308).
 *
 * A sibling of {@link sharedWithSentence} rather than a second sentence in a
 * second module: both answer "what is ticked above these boxes", and a dialog
 * that counted differently from the one next to it would be the drift M3 exists
 * to end.
 *
 * It counts the viewer's own lists and never the occasion's total. `list_count`
 * on the card includes other people's lists, and a sentence over a member's
 * checkboxes that counted them would be answering a different question from the
 * rows below it.
 */
export function listsSharedHereSentence(count: number): string {
  if (count === 0) return "None of your lists are shared here yet.";
  return `${counted(count, "of your lists is", "of your lists are")} shared here.`;
}


/**
 * Why an archived occasion refuses a share, said **once**.
 *
 * Two surfaces say it: the disabled control, which says it before anything is
 * attempted, and the 409 toast, when an occasion is archived between the dialog
 * loading and a tick landing. One fact, so one sentence — the drift NEU-1308's
 * Decision 1 exists to end would be funny to reintroduce in the same ticket.
 */
export const OCCASION_ARCHIVED = "This occasion is archived, so lists can't be shared to it.";

/**
 * The same refusal, plus the way out — for the toast alone.
 *
 * A viewer reading the disabled control is not mid-action and has the occasion
 * in front of them; one who just ticked a box needs to know what to do next.
 * The list's own modal adds "pick another" here, which has no meaning when the
 * occasion is the fixed half of the dialog.
 */
export const OCCASION_ARCHIVED_MID_SHARE = `${OCCASION_ARCHIVED} Ask an organizer to unarchive it.`;
