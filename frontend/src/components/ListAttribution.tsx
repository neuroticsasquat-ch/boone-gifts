import { attributionFor, recipientLabel, type ListLike } from "../lib/attribution";

/**
 * The attribution line on a list row someone else owns — "from Tom", "from Jane",
 * or "for Beth · kept by Tom" (NEU-1216 §2.5). Plain text: these rows are already
 * wrapped in a link to the list, so there is no per-half link to place here.
 */
export function ListAttributionLine({ list }: { list: ListLike }) {
  const attribution = attributionFor(list);
  return (
    <p className="text-sm text-gray-500">
      {attribution.kind === "absent"
        ? `for ${attribution.subject} · kept by ${attribution.keeper}`
        : `from ${attribution.subject}`}
    </p>
  );
}

/**
 * The owner-side label on their own rows — "for Beth", or nothing on a list with
 * no recipient. Without it, an owner's own list and the list they keep for
 * someone else are distinguishable only by whatever they typed as the name.
 */
export function RecipientLine({ list }: { list: ListLike }) {
  const label = recipientLabel(list);
  if (label === null) return null;
  return <p className="mt-0.5 text-sm text-gray-500">{label}</p>;
}
