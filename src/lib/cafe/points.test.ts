import { describe, it, expect } from "vitest";
import { earnPoints, availableRewards, canRedeem, redeemOneReward } from "./points";

describe("loyalty points", () => {
  it("earns floor(net / rate)", () => {
    expect(earnPoints(2500, 250)).toBe(10);
    expect(earnPoints(2499, 250)).toBe(9); // never over-award on partials
    expect(earnPoints(0, 250)).toBe(0);
    expect(earnPoints(5000, 0)).toBe(0); // guard divide-by-zero
  });

  it("counts affordable rewards", () => {
    expect(availableRewards(250, 100)).toBe(2);
    expect(availableRewards(90, 100)).toBe(0);
    expect(canRedeem(100, 100)).toBe(true);
    expect(canRedeem(99, 100)).toBe(false);
  });

  it("redeems one reward, capped at the order total, never negative", () => {
    // affordable, reward value below total → full reward value discount
    expect(redeemOneReward(100, 100, 3000, 8000)).toEqual({ points: 100, discount: 3000 });
    // reward value above total → capped at total (no cash refund)
    expect(redeemOneReward(100, 100, 3000, 2000)).toEqual({ points: 100, discount: 2000 });
    // cannot afford a reward → no redemption
    expect(redeemOneReward(90, 100, 3000, 8000)).toEqual({ points: 0, discount: 0 });
  });
});
