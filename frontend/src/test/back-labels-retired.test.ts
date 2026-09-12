import { describe, it, expect } from "vitest";

/**
 * Seven hardcoded back links, in seven phrasings, for four destinations, were
 * replaced by one control in NEU-1302. This is the standing guard that an
 * eighth page does not reinvent one of the phrasings it retired — the
 * grep-level assertion the ticket asked to finish with, run on every suite, in
 * the shape the sibling retirement guard beside this file already uses. That
 * one is named only by description here, because it fails on any file carrying
 * the phrase *it* retired, this one included.
 *
 * Every destination has one word now — **Lists**, **People**, or the family's
 * own name — and `BackControl` is where it is spelled.
 */
const sources = import.meta.glob("../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const RETIRED: { label: string; pattern: RegExp }[] = [
  // Case-sensitive: `Back to Lists` is the surviving word, `Back to lists` the
  // retired phrasing it replaced.
  { label: "Back to lists", pattern: /Back to lists/ },
  // Named a *section* of /people rather than the page, which is the fault
  // CONTEXT.md already calls out for "connect" and "collect".
  { label: "Back to connections", pattern: /Back to connections/i },
  { label: "Back to family / families", pattern: /Back to famil(y|ies)/i },
  // The bare arrow forms: `← Lists`, `&larr; Lists`, and the same for People.
  { label: "← Lists / ← People", pattern: /(←|&larr;)\s*(Lists|People)\b/ },
];

/** Every literal `<Link to="/people">…</Link>` in a file, with its label text. */
function peopleLinkLabels(source: string): string[] {
  return [...source.matchAll(/<Link\s+to="\/people"[^>]*>([\s\S]{0,160}?)<\/Link>/g)].map(
    ([, label]) => label.replace(/\s+/g, " ").trim(),
  );
}

/**
 * `/people` is called **People**, and a link to it may not be labelled with the
 * name of a *section* of it. The plural section words are the fault; the
 * singular domain noun is not — "Add a connection" names the thing you would
 * create, not the place the link goes.
 */
const SECTION_WORDS = /\b(families|connections)\b/i;

describe("the retired back-link phrasings", () => {
  it.each(RETIRED)("leave no occurrence of $label under src/", ({ pattern }) => {
    const offenders = Object.entries(sources)
      .filter(([path]) => !path.endsWith("back-labels-retired.test.ts"))
      .filter(([, source]) => pattern.test(source))
      .map(([path]) => path);

    expect(offenders).toEqual([]);
  });

  // The other half of the retirement, and the half a phrase list cannot catch:
  // "Manage families" and "Go to your families" both named a section of
  // `/people` rather than the page, which is the same fault as `← Back to
  // connections` and is what CONTEXT.md's forbidden-words clause now covers.
  it("leaves no link to /people labelled with a section of it", () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => !path.endsWith("back-labels-retired.test.ts"))
      .flatMap(([path, source]) =>
        peopleLinkLabels(source)
          .filter((label) => SECTION_WORDS.test(label))
          .map((label) => `${path}: ${label}`),
      );

    expect(offenders).toEqual([]);
  });
});
