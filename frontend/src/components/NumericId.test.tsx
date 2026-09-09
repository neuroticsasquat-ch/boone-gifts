import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { NumericId, useNumericId } from "./NumericId";

/**
 * Renders the id the wrapper published, so a valid row proves two things at
 * once: the page mounted, and what it was handed is a real number.
 */
function Probe() {
  return <p>id: {useNumericId()}</p>;
}

function renderAt(raw: string) {
  return render(
    <MemoryRouter initialEntries={[`/lists/${encodeURIComponent(raw)}`]}>
      <Routes>
        <Route
          path="/lists/:id"
          element={
            <NumericId back="/lists">
              <Probe />
            </NumericId>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

/**
 * The table from the spec's Decision 3, plus `"0"`. Every rejected row is one
 * `Number.isFinite(Number(id))` let through or turned into a backend error:
 * `0x10` and `1e3` are the two that silently loaded a *different* page than the
 * address named.
 */
const CASES: { raw: string; valid: boolean; note: string }[] = [
  { raw: "42", valid: true, note: "a plain positive integer" },
  { raw: "abc", valid: false, note: "not a number at all" },
  { raw: "0x10", valid: false, note: "hex — Number() would make this 16" },
  { raw: "1e3", valid: false, note: "exponent — Number() would make this 1000" },
  { raw: "1.5", valid: false, note: "not an integer" },
  { raw: " ", valid: false, note: "blank — Number() would make this 0" },
  { raw: "-1", valid: false, note: "negative" },
  { raw: "99999999999999999999", valid: false, note: "beyond a safe integer" },
  { raw: "0", valid: false, note: "ids start at 1, so this is a wrong address" },
];

describe("NumericId", () => {
  describe("the validity rule", () => {
    it.each(CASES)("$raw — $note", ({ raw, valid }) => {
      renderAt(raw);

      if (valid) {
        expect(screen.getByText(`id: ${raw}`)).toBeInTheDocument();
        expect(screen.queryByText("This page's address isn't valid.")).not.toBeInTheDocument();
      } else {
        expect(screen.getByText("This page's address isn't valid.")).toBeInTheDocument();
        expect(screen.queryByText(/^id: /)).not.toBeInTheDocument();
      }
    });
  });

  it("offers a way back and no retry — retrying a wrong address cannot help", () => {
    renderAt("abc");

    expect(screen.getByRole("link", { name: "← Back to Lists" })).toHaveAttribute("href", "/lists");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("names the section it sends you back to", () => {
    render(
      <MemoryRouter initialEntries={["/people/families/abc"]}>
        <Routes>
          <Route
            path="/people/families/:id"
            element={
              <NumericId back="/people">
                <Probe />
              </NumericId>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "← Back to People" })).toHaveAttribute(
      "href",
      "/people",
    );
  });

  it("throws when the hook is used outside a wrapper, rather than yielding NaN", () => {
    expect(() => render(<Probe />)).toThrow("useNumericId must be used inside <NumericId>");
  });
});
