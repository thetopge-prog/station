import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NAV, navFor } from "./nav";
import { STAFF_ROLES } from "./roles";

describe("navFor", () => {
  it("puts الطلبات الواردة and التجهيز one tap from the cashier", () => {
    const hrefs = navFor("cashier").primary.map((l) => l.href);
    expect(hrefs).toContain("/orders");
    expect(hrefs).toContain("/expediter");
  });

  it("gives every role a primary set, and never more than four", () => {
    for (const role of STAFF_ROLES) {
      const { primary } = navFor(role);
      expect(primary.length, role).toBeGreaterThan(0);
      expect(primary.length, role).toBeLessThanOrEqual(4);
    }
  });

  it("loses nothing to the shelves: every visible link sits in exactly one group", () => {
    for (const role of STAFF_ROLES) {
      const { links, groups } = navFor(role, true);
      const filed = groups.flatMap((g) => g.items.map((l) => l.href));
      expect(new Set(filed), role).toEqual(new Set(links.map((l) => l.href)));
      expect(filed.length, role).toBe(new Set(filed).size);
    }
  });

  it("keeps the roles apart — a chef sees the kitchen, not the drawer", () => {
    const chef = navFor("chef").links.map((l) => l.href);
    expect(chef).toContain("/kds");
    for (const shut of ["/cashier", "/daily", "/expenses", "/debts"]) expect(chef).not.toContain(shut);
  });

  it("hides التركيب from an owner who is not the developer", () => {
    expect(navFor("admin").links.map((l) => l.href)).not.toContain("/setup");
    expect(navFor("admin", true).links.map((l) => l.href)).toContain("/setup");
  });

  it("never lands a role on a page that would bounce them elsewhere", () => {
    // the logo links to primary[0]; /dashboard redirects every non-admin away
    for (const role of STAFF_ROLES) {
      const first = navFor(role).primary[0];
      expect(first, role).toBeDefined();
      if (role !== "admin") expect(first!.href, role).not.toBe("/dashboard");
    }
  });
});

/**
 * The one that matters most.
 *
 * Nine staff pages shipped with no guard at all: the nav was the only thing
 * hiding them, so anyone who knew the address walked in. The nine are fixed —
 * but the bug was never the missing line, it was that missing it made no sound.
 * This is the sound.
 */
describe("every screen in the nav is guarded", () => {
  // Two shapes count: throwing (requireRole and friends) and redirecting —
  // /dashboard sends non-admins to the till rather than showing them an error.
  const GUARD = /require(Role|Admin|Staff|Developer)\s*\(|redirect\s*\(/;
  for (const item of NAV) {
    // allow:null is «every signed-in staff member»; the (staff) layout already
    // bounces a signed-out visitor, so there is no role left to enforce.
    if (item.allow === null) continue;
    // /queue is the customers' TV: deliberately outside (staff), authenticated
    // by display key instead, because a sign-in form on the ceiling is useless.
    if (item.external) continue;
    it(`${item.href} — ${item.label}`, () => {
      const src = readFileSync(`src/app/(staff)${item.href}/page.tsx`, "utf8");
      expect(GUARD.test(src), `${item.href} has no requireRole/requireAdmin/requireStaff`).toBe(true);
    });
  }
});
