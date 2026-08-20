import { redirect } from "next/navigation";
import { getStaff } from "@/lib/cafe/auth";
import { isDemoServer } from "@/lib/cafe/demo";
import { getRangeSummary, getRecentOrders, getGuestEstimate, getTodaySinceReset, getDaySummary, type DaySummary, type RecentOrder } from "@/lib/cafe/dashboard-actions";
import { getMonthlyCosts } from "@/lib/cafe/expense-actions";
import { getTotalOutstanding } from "@/lib/cafe/debt-actions";
import { lastNDays, businessDay } from "@/lib/cafe/time";
import { DashboardClient } from "@/components/cafe/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const sp = await searchParams;
  const days = sp.days === "30" ? 30 : sp.days === "1" ? 1 : 7;

  if (!isDemoServer()) {
    const staff = await getStaff();
    if (staff && staff.role !== "admin") redirect("/cashier");
  }

  let summary: DaySummary[] = [];
  let recent: RecentOrder[] = [];
  let monthlyCosts = 0;
  let guestsToday = 0;
  let guestsRange = 0;
  let todayReset: DaySummary | null = null;
  let outstandingDebts = 0;
  const today = businessDay();
  // lastNDays(2) is [yesterday, today] in Baghdad time — reusing it drops a
  // raw Date.now() out of render, which React 19 flags as an impure call.
  const [yesterday] = lastNDays(2);
  let yesterdaySummary: DaySummary | null = null;
  try {
    const [from, to] = lastNDays(days);
    const [s, r, mc, gt, gr, tr, od, ys] = await Promise.all([
      getRangeSummary(from, to),
      getRecentOrders(12),
      getMonthlyCosts(),
      getGuestEstimate(to, to),
      getGuestEstimate(from, to),
      getTodaySinceReset(),
      getTotalOutstanding(),
      getDaySummary(yesterday),
    ]);
    summary = s;
    recent = r;
    monthlyCosts = mc.reduce((t, c) => t + c.amount, 0);
    guestsToday = gt;
    guestsRange = gr;
    todayReset = tr;
    outstandingDebts = od;
    yesterdaySummary = ys;
  } catch {
    // demo mode or transient DB failure — render the empty state below
  }

  return <DashboardClient days={days} summary={summary} recent={recent} monthlyCosts={monthlyCosts} guestsToday={guestsToday} guestsRange={guestsRange} todayReset={todayReset} outstandingDebts={outstandingDebts} todayDate={today} yesterday={yesterday} yesterdaySummary={yesterdaySummary} />;
}
