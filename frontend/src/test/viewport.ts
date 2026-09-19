/**
 * The suite's viewport, and the one place `window.matchMedia` is stubbed.
 *
 * jsdom has no layout and no `matchMedia`, so every query has to be answered by
 * hand. Before `ActionBar` gained `collapseOnMobile` (ADR 0010) the stub
 * answered `false` to everything, which was harmless while the only caller was
 * `react-hot-toast` asking about `prefers-reduced-motion`. It stopped being
 * harmless the moment a component branched on width: the whole suite would have
 * rendered the *collapsed* arm and every existing assertion about a visible
 * action would have had to change.
 *
 * So the default is a desktop viewport — `md` and up — which is the arm the
 * suite was written against, and a mobile test is a deliberate one-line
 * override. `setup.ts` reinstalls the default after every test.
 */

/** Tailwind v4's `md`, and the only breakpoint this app branches on in JS. */
const MD = /\(min-width:\s*768px\)/;

function install(matches: (query: string) => boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: matches(query),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

/** A desktop viewport: `md` matches, and nothing else does. */
export function installDefaultViewport() {
  install((query) => MD.test(query));
}

/**
 * Render the next thing at a phone's width, or back at a desktop's.
 *
 * Only the `md` query moves. `prefers-reduced-motion` stays `false` at both
 * sizes because the honest answer there is still no, whatever the width is.
 */
export function mockViewport(size: "mobile" | "desktop") {
  install((query) => MD.test(query) && size === "desktop");
}
