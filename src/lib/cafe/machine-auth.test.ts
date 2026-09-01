import { describe, expect, it } from "vitest";
import { secretMatches } from "./machine-auth";

describe("secretMatches", () => {
  it("accepts only the exact secret", () => {
    expect(secretMatches("abc123", "abc123")).toBe(true);
    expect(secretMatches("abc124", "abc123")).toBe(false);
  });

  it("refuses the empty and the missing rather than matching them", () => {
    // A route whose secret is unset must not accept "" from anyone.
    expect(secretMatches("", "")).toBe(false);
    expect(secretMatches(null, "abc")).toBe(false);
    expect(secretMatches(undefined, "abc")).toBe(false);
    expect(secretMatches("abc", "")).toBe(false);
  });

  it("refuses a prefix, which a length check alone would let through", () => {
    expect(secretMatches("abc", "abc123")).toBe(false);
    expect(secretMatches("abc123456", "abc123")).toBe(false);
  });
});
