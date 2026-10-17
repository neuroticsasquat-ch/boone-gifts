/* eslint-disable react/only-export-components */

/**
 * Its own type, so a deliberate test error is never mistaken for — or grouped
 * with — a real one in Bugsink.
 */
export class BugsinkTestError extends Error {
  constructor() {
    super("Deliberate test error from ?test-error");
    this.name = "BugsinkTestError";
  }
}

/**
 * Hidden trigger for checking error reporting end to end: load any page with
 * `?test-error` and this throws during render, which the `Sentry.ErrorBoundary`
 * in `App.tsx` catches and reports. Nothing links here. It sits outside the
 * router because React Router's own route error boundary would otherwise catch
 * the error first and Sentry would never see it.
 */
export function TestErrorTrigger() {
  if (new URLSearchParams(window.location.search).has("test-error")) {
    throw new BugsinkTestError();
  }
  return null;
}
