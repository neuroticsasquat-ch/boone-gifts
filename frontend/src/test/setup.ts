import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, afterAll, beforeAll } from "vitest";
import { server } from "./mocks/server";
import { installDefaultViewport } from "./viewport";

// jsdom implements no `matchMedia`, so the suite answers it — at a desktop
// width, which is the arm every existing assertion was written against. See
// `viewport.ts` for why the default is not `false` to everything any more.
installDefaultViewport();

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  // A `mockViewport("mobile")` lasts exactly one test.
  installDefaultViewport();
});
afterAll(() => server.close());
