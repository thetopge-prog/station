"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireRole } from "./auth";
import { businessDay } from "./time";
import type { SessionRow } from "./session-actions";
import { dailyCountDoc } from "./escpos";
import { buildDailyCountJob } from "./printer-actions";
import { BRAND } from "@/lib/brand";

/**
 * «جرد اليوم» — الورقة التي تُملأ آخر الليل.
 *
 * The shop already had every one of these numbers, spread across five screens
 * and nowhere together. A reconciliation is not a new calculation; it is the
 * one page a person signs, and then finds again next month when a figure is
 * disputed.
 *
 * Nothing here re-derives money. Cash comes from the shift reports the drawer
 * already produces, sales from range_summary, fixed cost from
 * daily_fixed_cost() — the same functions the dashboard and the nightly
 * Telegram report read, so three places can never disagree about one day.
 */

export type DailyCount = {
  day: string;
  /** each shift of the day, with what it expected and what was counted */
  sessions: SessionRow[];
  opening_float: number;
  cash_sales: number;
  card_sales: number;
  partner_sales: number;
  orders_count: number;
  guests: number;
  expenses: number;
  deposited: number;
  debts_issued: number;
  /** float + cash − expenses − deposited, summed across the day's shifts */
  expected_cash: number;
  sales: number;
  profit: number;
  fixed_cost: number;
  net: number;
  stock_value: number;
  partners_owed: number;
  customers_owed: number;
  /** what the person doing the count typed, if they have been here already */
  counted_cash: number;
  count_deposited: number;
  note: string | null;
  closed_at: string | null;
};

export async function getDailyCount(day = businessDay()): Promise<DailyCount> {
  await requireRole("cashier");
  const svc = createSupabaseServiceClient();

  const [sessionsRes, summaryRes, fixedRes, stockRes, partnersRes, debtsRes, guestsRes, savedRes, ordersRes] =
    await Promise.all([
      svc
        .from("cashier_sessions")
        .select(
          "id, cashier_id, opened_at, closed_at, opening_float, counted_cash, deposited, expected_cash, variance, close_note, handover_confirmed_at, handover_counted, handover_amount",
        )
        .eq("business_day", day)
        .order("opened_at", { ascending: true }),
      svc.rpc("range_summary", { p_from: day, p_to: day }),
      svc.rpc("daily_fixed_cost"),
      svc.rpc("stock_value"),
      svc.from("partner_balances").select("balance"),
      svc.from("debtor_balances").select("balance"),
      svc.rpc("guest_estimate", { p_from: day, p_to: day }),
      svc.from("daily_counts").select("counted_cash, deposited, note, closed_at").eq("business_day", day).maybeSingle(),
      // the money split the Z-report makes per shift, made once for the day
      svc.from("orders").select("subtotal, discount, extra, payment_method").eq("business_day", day).eq("status", "paid"),
    ]);

  const sessions = sessionsRes.data ?? [];
  const empIds = [...new Set(sessions.map((s) => s.cashier_id))];
  const { data: emps } = empIds.length
    ? await svc.from("employees").select("id, name_ar").in("id", empIds)
    : { data: [] };
  const nameOf = new Map((emps ?? []).map((e) => [e.id, e.name_ar]));

  const paid = ordersRes.data ?? [];
  const money = (o: { subtotal: number; discount: number; extra: number }) => +o.subtotal - +o.discount + +o.extra;
  const sumBy = (m: string) => paid.filter((o) => o.payment_method === m).reduce((t, o) => t + money(o), 0);

  const summary = (summaryRes.data as { sales: number; profit: number; expenses: number; net: number }[] | null)?.[0];
  const fixed = (fixedRes.data as { total: number }[] | null)?.[0];

  const opening_float = sessions.reduce((t, s) => t + (s.opening_float ?? 0), 0);
  const deposited = sessions.reduce((t, s) => t + (s.deposited ?? 0), 0);
  const cash_sales = sumBy("cash");
  const expenses = summary?.expenses ?? 0;

  // Debts issued today, which left the drawer as goods and not as money.
  const { data: debtRows } = await svc
    .from("debt_entries")
    .select("amount, kind")
    .eq("business_day", day)
    .eq("kind", "debit");

  const positive = (rows: { balance: number }[] | null) =>
    (rows ?? []).reduce((t, r) => t + Math.max(0, +r.balance), 0);

  return {
    day,
    sessions: sessions.map((s) => ({ ...s, cashier_name: nameOf.get(s.cashier_id) ?? "—" })),
    opening_float,
    cash_sales,
    card_sales: sumBy("card"),
    partner_sales: sumBy("partner"),
    orders_count: paid.length,
    guests: (guestsRes.data as number | null) ?? 0,
    expenses,
    deposited,
    debts_issued: (debtRows ?? []).reduce((t, d) => t + d.amount, 0),
    expected_cash: opening_float + cash_sales - expenses - deposited,
    sales: summary?.sales ?? 0,
    profit: summary?.profit ?? 0,
    fixed_cost: fixed?.total ?? 0,
    net: (summary?.profit ?? 0) - (fixed?.total ?? 0),
    stock_value: (stockRes.data as number | null) ?? 0,
    partners_owed: positive(partnersRes.data as { balance: number }[] | null),
    customers_owed: positive(debtsRes.data as { balance: number }[] | null),
    counted_cash: savedRes.data?.counted_cash ?? 0,
    count_deposited: savedRes.data?.deposited ?? 0,
    note: savedRes.data?.note ?? null,
    closed_at: savedRes.data?.closed_at ?? null,
  };
}

/**
 * Save what the counter typed — and only that.
 *
 * The sales figures travel as a snapshot so the sheet can be reprinted a month
 * later and still say what it said. They are NOT editable, and that is the
 * point: anyone who can edit the sales figure can hide a theft. The count and
 * the note are where a difference gets explained, not erased.
 */
export async function saveDailyCount(input: {
  day?: string;
  counted: number;
  deposited: number;
  note?: string | null;
  close?: boolean;
}) {
  await requireRole("cashier");
  const day = input.day ?? businessDay();
  const snapshot = await getDailyCount(day);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_daily_count", {
    p_day: day,
    p_counted: Math.max(0, Math.round(input.counted) || 0),
    p_deposited: Math.max(0, Math.round(input.deposited) || 0),
    p_note: input.note?.trim() || null,
    p_snapshot: snapshot as unknown as never,
    p_close: input.close === true,
  });
  if (error) {
    return {
      ok: false as const,
      error: /already closed/i.test(error.message)
        ? "جرد هذا اليوم مُقفل — لا يُعدَّل بعد الإقفال."
        : error.message,
    };
  }
  revalidatePath("/daily");
  return { ok: true as const };
}

/**
 * Build the strip for the till printer.
 *
 * Assembled on the server so the numbers on paper are the same ones the page
 * showed, read in the same request rather than passed up from a browser that
 * may have been sitting open since noon.
 */
export async function buildDailyCountPrint(day = businessDay()) {
  const staff = await requireRole("cashier");
  const d = await getDailyCount(day);
  const job = await buildDailyCountJob(
    dailyCountDoc({
      ...d,
      shopName: BRAND.nameAr,
      counted_cash: d.counted_cash,
      by: staff.name,
    }),
  );
  if (!job) return { ok: false as const, error: "لا توجد طابعة كاشير مفعّلة — اضبطها من صفحة الطابعات." };
  return { ok: true as const, job };
}
