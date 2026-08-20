/** Loyalty config, server-side, from env with sane defaults (see .env.example). */
function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function loyaltyConfig() {
  return {
    pointsPerIqd: num("POINTS_PER_IQD", 250),
    pointsPerReward: num("POINTS_PER_REWARD", 100),
    rewardValueIqd: num("REWARD_VALUE_IQD", 3000),
  };
}
