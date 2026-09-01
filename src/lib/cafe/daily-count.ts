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
  /**
   * الأرباح للإدارة وحدها — null لغيرها.
   *
   * صاحب المحل: «لا أريد الأرباح تظهر في حساب الكاشير». وإخفاؤها في الواجهة
   * وحدها لا يكفي: الرقم يسافر في حمولة الصفحة ويُقرأ من مصدرها. فيُحذف من
   * المصدر، ولا يغادر الخادم أصلاً.
   */
  profit: number | null;
  fixed_cost: number | null;
  net: number | null;
  stock_value: number | null;
  /** هل يرى صاحب هذه النسخة الأرباح؟ */
  is_admin: boolean;
  partners_owed: number;
  customers_owed: number;
  /** what the person doing the count typed, if they have been here already */
  counted_cash: number;
  count_deposited: number;
  note: string | null;
  closed_at: string | null;
};

/**
 * النسخة الكاملة — للخادم وحده.
 *
 * تُستعمل للّقطة المُجمَّدة وللطباعة بحساب الإدارة. لا تُعاد إلى المتصفح أبداً
 * كما هي: اللقطة يجب أن تبقى كاملة (وإلا صار جردٌ حفظه كاشير ناقصاً إلى
 * الأبد)، والشاشة يجب أن تُقصّ.
 */
async function getDailyCountFull(day: string): Promise<DailyCount> {
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

  /*
   * Every one of these must have worked, or the sheet lies.
   *
   * All seven used to be read as `.data ?? 0` with the error dropped. One
   * transient failure on range_summary printed «مبيعات ٠» at midnight; the
   * cashier signs it, closes the day — and a closed day cannot be reopened
   * (0056). Worse, if only the orders read failed, cash_sales went to zero
   * while opening_float did not, so the drawer showed a SURPLUS the size of
   * the day's takings — the exact shape of the bug stampPayment already fixed
   * once. A page that fails to load is a nuisance; a page that quietly reads
   * zero is a forged document.
   */
  for (const [what, res] of [
    ["الورديات", sessionsRes], ["ملخّص اليوم", summaryRes], ["الكلفة الثابتة", fixedRes],
    ["قيمة المخزون", stockRes], ["أرصدة الشركات", partnersRes], ["ديون الزبائن", debtsRes],
    ["عدد الزبائن", guestsRes], ["الجرد المحفوظ", savedRes], ["طلبات اليوم", ordersRes],
  ] as const) {
    if (res.error) throw new Error(`تعذّر جلب ${what}: ${res.error.message}`);
  }

  const sessions = sessionsRes.data ?? [];
  const empIds = [...new Set(sessions.map((s) => s.cashier_id))];
  const { data: emps, error: empErr } = empIds.length
    ? await svc.from("employees").select("id, name_ar").in("id", empIds)
    : { data: [], error: null };
  if (empErr) throw new Error(`تعذّر جلب أسماء الكاشيرين: ${empErr.message}`);
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
  const { data: debtRows, error: debtErr } = await svc
    .from("debt_entries")
    .select("amount, kind")
    .eq("business_day", day)
    .eq("kind", "debit");
  if (debtErr) throw new Error(`تعذّر جلب ديون اليوم: ${debtErr.message}`);

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
    is_admin: true,
  };
}

/** ما يراه من فتح الصفحة: كامل للإدارة، وبلا أرباح لغيرها. */
export async function getDailyCount(day = businessDay()): Promise<DailyCount> {
  const staff = await requireRole("cashier");
  const full = await getDailyCountFull(day);
  if (staff.role === "admin") return full;
  return { ...full, profit: null, fixed_cost: null, net: null, stock_value: null, is_admin: false };
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
  const snapshot = await getDailyCountFull(day);

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
  const d = staff.role === "admin" ? await getDailyCountFull(day) : await getDailyCount(day);
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
