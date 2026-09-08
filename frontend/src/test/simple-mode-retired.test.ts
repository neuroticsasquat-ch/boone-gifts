import { describe, it, expect } from "vitest";

/**
 * Simple mode was retired in NEU-1261 (project spec §8): the full-mode behaviour
 * is now the only behaviour. The removal was a sweep across two dozen files, so
 * this is the standing guard that no reference creeps back in — the grep-level
 * assertion the ticket asked to finish with, run on every suite.
 */
const sources = import.meta.glob("../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

// The identifier in any casing, and the phrase itself: "simple_mode",
// "simpleMode", "Simple mode".
const RETIRED = /simple[\s_-]?mode/i;

describe("simple mode is retired", () => {
  it("leaves no reference anywhere under src/", () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => !path.endsWith("simple-mode-retired.test.ts"))
      .filter(([, source]) => RETIRED.test(source))
      .map(([path]) => path);

    expect(offenders).toEqual([]);
  });
});
