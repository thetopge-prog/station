"use server";

import { requireStaff } from "@/lib/cafe/auth";
import { cloudReachable } from "./net";
import { backlog, hubEnabled } from "./store";
import { drainHub } from "./sync";

export type HubStatus = {
  /** false everywhere except the mini PC in the shop */
  enabled: boolean;
  online: boolean;
  /** rows the shop is still holding on the cloud's behalf */
  orders: number;
  preps: number;
};

/**
 * What the staff strip shows.
 *
 * An outage that nobody can see is worse than one they can: the first question
 * during a blackout is always "did that order go through?", and a shop with no
 * answer starts writing orders on paper alongside the ones already in the till.
 *
 * Also nudges the drain, so the backlog starts clearing the moment anyone is
 * looking at a screen — the 20s timer is the floor, not the only trigger.
 */
export async function hubStatus(): Promise<HubStatus> {
  if (!hubEnabled()) return { enabled: false, online: true, orders: 0, preps: 0 };
  await requireStaff();

  const online = await cloudReachable();
  if (online) void drainHub();
  const b = await backlog();
  return { enabled: true, online, orders: b.orders, preps: b.preps };
}
