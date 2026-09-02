import { describe, expect, it } from "vitest";
import { canAccess } from "./roles";

describe("canAccess", () => {
  it("lets a two-job person through BOTH doors — the whole point", () => {
    const omar = ["cashier", "expediter"] as const;
    expect(canAccess([...omar], ["cashier"])).toBe(true);
    expect(canAccess([...omar], ["expediter"])).toBe(true);
  });

  it("still refuses a door neither job opens", () => {
    expect(canAccess(["cashier", "expediter"], ["chef"])).toBe(false);
  });

  it("keeps the owner passing every gate", () => {
    expect(canAccess(["admin"], ["chef"])).toBe(true);
    expect(canAccess(["cashier", "admin"], [])).toBe(true);
  });

  it("refuses nobody-in-particular", () => {
    expect(canAccess(null, ["cashier"])).toBe(false);
    expect(canAccess([], ["cashier"])).toBe(false);
  });

  it("still accepts a single role, so old callers keep working", () => {
    expect(canAccess("cashier", ["cashier"])).toBe(true);
    expect(canAccess("cleaner", ["cashier"])).toBe(false);
    expect(canAccess("admin", ["chef"])).toBe(true);
  });

  it("an empty allowlist means admin only — the convention the nav relies on", () => {
    expect(canAccess(["cashier"], [])).toBe(false);
    expect(canAccess(["admin"], [])).toBe(true);
  });
});
