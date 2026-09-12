import { describe, it, expect } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import {
  failureMessage,
  FAILURE_RATE_LIMITED,
  FAILURE_SERVER,
  FAILURE_UNREACHABLE,
} from "./request-failure";

function axiosErrorWithStatus(status: number): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError("failed", "ERR_BAD_REQUEST", config, {}, {
    status,
    statusText: "",
    headers: {},
    config,
    data: {},
  });
}

function axiosErrorWithNoResponse(code: string): AxiosError {
  return new AxiosError("failed", code, { headers: new AxiosHeaders() }, {});
}

describe("failureMessage", () => {
  it("calls a non-axios throw our own failure", () => {
    // A TypeError from a bug in our own code reaches the same catch as a
    // rejected login. Classifying it as a rejection would answer a client-side
    // bug with a confident claim about the user's password — the defect this
    // module exists to remove.
    expect(failureMessage(new TypeError("x is not a function"))).toBe(FAILURE_SERVER);
    expect(failureMessage(undefined)).toBe(FAILURE_SERVER);
    expect(failureMessage("a string")).toBe(FAILURE_SERVER);
  });

  it("calls a request that got no response unreachable", () => {
    // Connection refused, DNS failure and a CORS rejection all arrive this way.
    expect(failureMessage(axiosErrorWithNoResponse("ERR_NETWORK"))).toBe(FAILURE_UNREACHABLE);
  });

  it("calls a timed-out request unreachable too", () => {
    // A host that accepts the connection and never answers carries no response
    // either, so the instance timeout needs no branch of its own.
    expect(failureMessage(axiosErrorWithNoResponse("ECONNABORTED"))).toBe(FAILURE_UNREACHABLE);
  });

  it("names rate limiting for a 429", () => {
    expect(failureMessage(axiosErrorWithStatus(429))).toBe(FAILURE_RATE_LIMITED);
  });

  it("calls a 5xx our own failure", () => {
    expect(failureMessage(axiosErrorWithStatus(500))).toBe(FAILURE_SERVER);
    expect(failureMessage(axiosErrorWithStatus(503))).toBe(FAILURE_SERVER);
  });

  it("returns null for every 4xx the server answers with", () => {
    // Null means "the server answered and rejected you", and nothing else —
    // it is the whole contract the four auth pages branch on to pick their own
    // rejection wording. Pinned across the range rather than implied by 400.
    for (const status of [400, 401, 403, 404, 409, 418, 422, 428]) {
      expect(failureMessage(axiosErrorWithStatus(status))).toBeNull();
    }
  });
});
