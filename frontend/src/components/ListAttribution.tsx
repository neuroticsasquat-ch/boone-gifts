import {
  attributionFor,
  recipientLabel,
  type ListAttribution,
  type ListLike,
} from "../lib/attribution";

/**
 * The attribution line on a list row someone else owns — "from Jane" for a person,
 * the bare "Boone Family" for a list that reached the viewer through a family
 * (NEU-1235), or "for Beth · kept by Tom" (NEU-1216 §2.5). Plain text: these rows
 * are already wrapped in a link to the list, so there is no per-half link to place
 * here — and the source is a label, never a destination.
 *
 * `withinFamily` is `attributionFor`'s option under its own name and with its own
 * meaning — a fact about the surface, not an instruction about the label — so the
 * one call site that sets it (the occasion page's Lists tab) states where it is
 * rather than what it wants hidden. Off everywhere else, including both folder
 * surfaces: a folder is the viewer's grouping and establishes no family (NEU-1324).
 */
export function ListAttributionLine({
  list,
  withinFamily = false,
}: {
  list: ListLike;
  withinFamily?: boolean;
}) {
  const attribution = attributionFor(list, { withinFamily });
  // Only an owner with a blank name gets here, and a bare "from " would say less
  // than nothing.
  if (attribution === null) return null;
  return <p className="text-sm text-gray-500">{attributionText(attribution)}</p>;
}

/** The one place an attribution becomes words. The "absent" form drops its second
 *  half rather than trailing a preposition when the keeper has no name. */
function attributionText(attribution: ListAttribution): string {
  switch (attribution.kind) {
    case "absent":
      return attribution.keeper === null
        ? `for ${attribution.subject}`
        : `for ${attribution.subject} · kept by ${attribution.keeper}`;
    case "family":
      return attribution.subject;
    case "owner":
      return `from ${attribution.subject}`;
  }
}

/**
 * The owner-side label on their own rows — "for Beth", or **"Mine"** on a list
 * marked for nobody. Without it, an owner's own list and the list they keep for
 * someone else are distinguishable only by whatever they typed as the name — and
 * on a mixed screen like the occasion page, a bare title was the one row that
 * named no one at all.
 *
 * "Mine", not "from Tom": the viewer's own name read back to them is noise, but
 * the row's *relationship* to them is the thing the line is for. That makes this
 * component owner-only — every call site already gates on ownership, and
 * `ListAttribution.consistency.test.tsx` is where that stays true.
 */
export function RecipientLine({ list }: { list: ListLike }) {
  return <p className="mt-0.5 text-sm text-gray-500">{recipientLabel(list) ?? "Mine"}</p>;
}
