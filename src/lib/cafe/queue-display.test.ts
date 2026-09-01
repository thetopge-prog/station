import { describe, expect, it } from "vitest";
import { TIERS, fitColumn, justWentReady, pageNow, pageOf, slideNow } from "./queue-display";

const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString();

describe("justWentReady", () => {
  it("rings for an order that went ready within the last redraw", () => {
    expect(justWentReady([{ prep_status: "ready", updated_at: ago(3) }], 10)).toBe(true);
  });

  it("stays silent for one that has been ready a while — the bell already rang", () => {
    expect(justWentReady([{ prep_status: "ready", updated_at: ago(60) }], 10)).toBe(false);
  });

  it("allows two seconds of slack past the interval, for the round trip", () => {
    expect(justWentReady([{ prep_status: "ready", updated_at: ago(11) }], 10)).toBe(true);
    expect(justWentReady([{ prep_status: "ready", updated_at: ago(13) }], 10)).toBe(false);
  });

  it("never rings for an order still being prepared", () => {
    expect(justWentReady([{ prep_status: "preparing", updated_at: ago(1) }], 10)).toBe(false);
  });

  it("rings when any one of several orders just went ready", () => {
    const rows = [
      { prep_status: "ready", updated_at: ago(300) },
      { prep_status: "preparing", updated_at: ago(1) },
      { prep_status: "ready", updated_at: ago(2) },
    ];
    expect(justWentReady(rows, 10)).toBe(true);
  });

  it("is silent on an empty board", () => {
    expect(justWentReady([], 10)).toBe(false);
  });
});

describe("slideNow", () => {
  it("stays on the only slide there is", () => {
    expect(slideNow(1, 10)).toBe(0);
    expect(slideNow(0, 10)).toBe(0);
  });

  it("always names a real slide", () => {
    const i = slideNow(9, 10);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(9);
  });

  it("advances by one per interval, so each redraw is a new poster", () => {
    // two buckets one interval apart must differ by exactly one slide
    const bucket = Math.floor(Date.now() / 10_000);
    const a = bucket % 9;
    const b = (bucket + 1) % 9;
    expect((a + 1) % 9).toBe(b);
  });
});

describe("fitColumn", () => {
  // the shop's television: 960x540, which leaves a column about this tall
  const TV = 220;

  it("never picks cards too tall for the box it was given", () => {
    const floor = TIERS[TIERS.length - 1];
    for (const h of [120, 220, 400, 900]) {
      for (const n of [1, 3, 8, 40]) {
        const { tier } = fitColumn(n, h);
        // either it fits, or the box is too short for even the smallest card
        const ok = tier.cardH <= h || tier === floor;
        expect(ok, `${n} orders in ${h}px chose cardH ${tier.cardH}`).toBe(true);
      }
    }
  });

  it("shrinks rather than paginates while shrinking is still enough", () => {
    // four ready orders in a 260px column: cards get smaller, nothing rotates
    const { perPage } = fitColumn(4, 260);
    expect(perPage).toBeGreaterThanOrEqual(4);
  });

  it("uses the biggest cards a quiet board allows", () => {
    const quiet = fitColumn(1, 600).tier.font;
    const busy = fitColumn(30, 600).tier.font;
    expect(quiet).toBeGreaterThan(busy);
  });

  it("stops at the floor and pages instead — never shrinks past readable", () => {
    const floor = TIERS[TIERS.length - 1];
    expect(fitColumn(200, TV).tier.font).toBe(floor.font);
    expect(fitColumn(200, TV).tier.font).toBe(44);
  });

  it("always offers at least one card, even in an absurdly short column", () => {
    expect(fitColumn(5, 0).perPage).toBeGreaterThanOrEqual(1);
    expect(fitColumn(5, 10).perPage).toBeGreaterThanOrEqual(1);
  });

  it("keeps every tier ordered largest to smallest", () => {
    for (let i = 1; i < TIERS.length; i++) {
      expect(TIERS[i].font).toBeLessThan(TIERS[i - 1].font);
      expect(TIERS[i].cardH).toBeLessThan(TIERS[i - 1].cardH);
    }
  });
});

describe("pageNow", () => {
  const S = 10;
  it("does not page what already fits", () => {
    expect(pageNow(6, 9, S)).toBe(0);
    expect(pageNow(9, 9, S)).toBe(0);
  });

  it("advances one page per interval and wraps back to the first", () => {
    const t = 1_000_000_000_000;
    const seen = [0, 1, 2, 3].map((i) => pageNow(20, 9, S, t + i * S * 1000));
    expect(seen).toEqual([seen[0], (seen[0] + 1) % 3, (seen[0] + 2) % 3, seen[0]]);
  });

  it("survives an empty board without dividing by zero", () => {
    expect(pageNow(0, 9, S)).toBe(0);
    // perPage=0 would be a division by zero; it is clamped to one page each
    expect(Number.isInteger(pageNow(5, 0, S))).toBe(true);
    expect(pageOf([1, 2, 3], 0, S).shown.length).toBe(1);
  });
});

describe("pageOf", () => {
  const items = Array.from({ length: 20 }, (_, i) => i);

  it("shows every order across the rotation — nobody is dropped", () => {
    const t = 1_000_000_000_000;
    const seen = new Set<number>();
    for (let i = 0; i < 3; i++) pageOf(items, 9, 10, t + i * 10_000).shown.forEach((n) => seen.add(n));
    expect(seen.size).toBe(20);
  });

  it("reports the page count so the screen can say «٢ / ٣»", () => {
    expect(pageOf(items, 9, 10).pages).toBe(3);
    expect(pageOf([1, 2], 9, 10).pages).toBe(1);
  });

  it("never returns more than a page holds", () => {
    expect(pageOf(items, 9, 10).shown.length).toBeLessThanOrEqual(9);
  });
});
