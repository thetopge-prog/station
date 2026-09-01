import { requireRole } from "@/lib/cafe/auth";
import { getDailyCount } from "@/lib/cafe/daily-count";
import { DailyCountClient } from "@/components/cafe/DailyCountClient";

/**
 * /daily — «جرد اليوم».
 *
 * Reachable by the cashier as well as the owner: the person who counts the
 * drawer is the person standing at it, and a reconciliation only an absent
 * manager can open is a reconciliation nobody does.
 */
export const dynamic = "force-dynamic";

export default async function DailyPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const staff = await requireRole("cashier");
  const { day } = await searchParams;
  const initial = await getDailyCount(day);
  return <DailyCountClient initial={initial} cashier={staff.name} />;
}
