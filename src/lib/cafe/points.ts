/**
 * Loyalty points math (pure). Earn is spend-based; redeem converts a whole reward
 * into an IQD discount, guarded so it never exceeds balance or order total.
 * Config (rate / reward cost / reward value) comes from env — see .env.example.
 */

/** Points earned for a net (post-discount) spend. Floor so partial IQD never over-awards. */
export function earnPoints(netIqd: number, pointsPerIqd: number): number {
  if (pointsPerIqd <= 0 || netIqd <= 0) return 0;
  return Math.floor(netIqd / pointsPerIqd);
}

/** Whole rewards a balance can currently cover. */
export function availableRewards(balance: number, pointsPerReward: number): number {
  if (pointsPerReward <= 0 || balance <= 0) return 0;
  return Math.floor(balance / pointsPerReward);
}

export function canRedeem(balance: number, pointsPerReward: number): boolean {
  return availableRewards(balance, pointsPerReward) >= 1;
}

/**
 * Redeem one reward against an order. Returns the points to deduct and the IQD
 * discount to apply — discount is capped at the order total (never refunds cash),
 * and returns zeros when the balance can't afford a reward.
 */
export function redeemOneReward(
  balance: number,
  pointsPerReward: number,
  rewardValueIqd: number,
  orderTotal: number,
): { points: number; discount: number } {
  if (!canRedeem(balance, pointsPerReward)) return { points: 0, discount: 0 };
  const discount = Math.min(Math.max(0, Math.round(rewardValueIqd)), Math.max(0, Math.round(orderTotal)));
  if (discount <= 0) return { points: 0, discount: 0 };
  return { points: pointsPerReward, discount };
}
