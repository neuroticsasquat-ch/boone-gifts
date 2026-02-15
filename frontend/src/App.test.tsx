import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the login page by default (not authenticated)", () => {
    render(<App />);
    expect(screen.getByText("Log in")).toBeInTheDocument();
  });
});
