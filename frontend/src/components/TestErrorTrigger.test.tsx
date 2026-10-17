import * as Sentry from "@sentry/react";
import type { ErrorEvent } from "@sentry/react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App";

// The real SDK, initialised here so the assertion is that the event leaves
// through Sentry, not that some mock was called. `beforeSend` captures the
// event and drops it, so nothing is sent anywhere.
const sent: ErrorEvent[] = [];
Sentry.init({
  dsn: "https://public@bugsink.invalid/1",
  beforeSend(event) {
    sent.push(event);
    return null;
  },
});

afterEach(() => {
  vi.restoreAllMocks();
  sent.length = 0;
  window.history.replaceState(null, "", "/");
});

describe("TestErrorTrigger", () => {
  it("throws a BugsinkTestError that the ErrorBoundary catches and reports", async () => {
    // React logs the caught render error; it is the point of the test.
    vi.spyOn(console, "error").mockImplementation(() => {});
    window.history.replaceState(null, "", "/?test-error");

    render(<App />);

    expect(await screen.findByText("Something went wrong.")).toBeInTheDocument();
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    // The boundary links a synthetic "React ErrorBoundary" error carrying the
    // component stack onto ours, so the event holds both.
    const types = sent[0].exception?.values?.map((value) => value.type);
    expect(types).toContain("BugsinkTestError");
    expect(types).toContain("React ErrorBoundary BugsinkTestError");
  });

  it("renders nothing without the query parameter", async () => {
    render(<App />);

    expect(await screen.findByText("Log in")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong.")).not.toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });
});
