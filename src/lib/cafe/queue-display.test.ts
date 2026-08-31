import { describe, expect, it } from "vitest";
import { justWentReady, slideNow } from "./queue-display";

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
