"use server";

import { forgetSession } from "./session-of";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { cacheGet, cachePut, hubEnabled } from "@/lib/hub/store";
import { cloudReachable } from "@/lib/hub/net";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { getStaff, requireRole, requireStaff } from "./auth";
import { flushWaiting } from "./waitlist";

/**
 * Cashier sessions — الورديات المالية.
 *
 * A session is one cashier, one drawer, from the moment they count the opening
 * float to the moment they hand it on. Every sale, expense and debt written
 * while it is open belongs to it, which is what turns "the till is short" into
 * "the till was short on Ahmed's evening shift by 12,000".
 *
 * The reconciliation is deliberately one-way: the app computes what SHOULD be
 * in the drawer and asks the human for what IS. It never shows the expected
 * figure before the count is entered — a cashier who can see the target will
 * type the target.
 */

export type SessionReport = {
  opening_float: number;
  cash_sales: number;
  card_sales: number;
  orders_count: number;
  expenses_total: number;
  deposited: number;
  debts_issued: number;
  expected_cash: number;
};

export type OpenSession = {
  id: string;
  cashier_id: string;
  cashier_name: string;
  opened_at: string;
  opening_float: number;
};

export type PendingHandover = {
  session_id: string;
  from_name: string;
  amount: number;
  closed_at: string;
};

/**
 * The signed-in cashier's open session, if any.
 *
 * On the hub the last answer is remembered per cashier: with the line down the
 * gate would otherwise show «بدء الوردية» to someone whose drawer is open, and
 * opening it would fail too. A session opened online carries the till through
 * the outage; its sales are attributed at sync time (sync.ts).
 */
export async function myOpenSession(): Promise<OpenSession | null> {
  const staff = await requireStaff();
  const key = `session:${staff.employeeId}`;
  if (hubEnabled() && !(await cloudReachable())) {
    const cached = await cacheGet<OpenSession | null>(key);
    return cached ?? null;
  }
  const svc = createSupabaseServiceClient();
  const { data, error } = await svc
    .from("cashier_sessions")
    .select("id, cashier_id, opened_at, opening_float, cashier_name")
    .eq("cashier_id", staff.employeeId)
    .is("closed_at", null)
    .maybeSingle();
  if (error && hubEnabled()) return (await cacheGet<OpenSession | null>(key)) ?? null;
  const out = data ? { id: data.id, cashier_id: data.cashier_id, opened_at: data.opened_at, opening_float: data.opening_float, cashier_name: data.cashier_name || staff.name } : null;
  if (hubEnabled()) await cachePut(key, out);
  return out;
}

/** A closed drawer nobody has accepted yet — the thing that blocks the till. */
export async function pendingHandover(): Promise<PendingHandover | null> {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("pending_handover");
  return (data?.[0] as PendingHandover | undefined) ?? null;
}

/**
 * Start a shift.
 *
 * Two ways in: a fresh float agreed with management, or taking over the drawer
 * a colleague left. `counted` is what the incoming cashier physically counted —
 * stored alongside what the outgoing cashier said they left, because the gap
 * between those two numbers is the only place a handover loss can show up.
 */
/**
 * Postgres speaks English to a cashier who does not.
 *
 * «session already open» was rendered verbatim on the till, which is how a
 * refused shift looked like a wrong number instead of a shift that was never
 * closed.
 */
function arabicError(msg: string): string {
  if (/session already open/i.test(msg)) return "لديك وردية مفتوحة بالفعل — أنهِها أولاً من زر «إنهاء الوردية».";
  // الصندوق واحد للمحل. زميلك يحمله، فلا يفتحه أحد غيره حتى يُنهي ورديته —
  // وهذه هي المحاسبة نفسها، لا عائقاً فيها.
  const held = /drawer held by (.+)$/i.exec(msg);
  if (held) return `الصندوق مع ${held[1].trim()} الآن — عليه إنهاء ورديته وتسليمه، ثم تستلمه أنت.`;
  // شبكة أمان: لو نادى أحدٌ الدالةَ القديمة قبل ترحيل 0063، أو أضيف طريق ثالث
  // يتجاوز الحارس، فلا يقرأ الكاشير اسم فهرس بالإنكليزية.
  if (/cashier_sessions_one_open_shop|duplicate key/i.test(msg)) return "الصندوق مفتوح باسم كاشير آخر — عليه إنهاء ورديته أولاً.";
  if (/no employee record/i.test(msg)) return "حسابك غير مرتبط بموظف — راجع صفحة الموظفين.";
  if (/not staff/i.test(msg)) return "غير مصرّح — سجّل الدخول من جديد.";
  if (/already closed|session not found/i.test(msg)) return "هذه الوردية مُغلقة أصلاً — حدّث الصفحة.";
  if (/not staff/i.test(msg)) return "انتهت جلستك — سجّل الدخول من جديد.";
  return msg;
}

export async function openSession(input: { float: number; fromSession?: string | null; counted?: number | null; cashierName?: string | null }) {
  await requireRole("cashier");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("open_cashier_session", {
    p_float: Math.max(0, Math.round(input.float) || 0),
    p_from_session: input.fromSession ?? null,
    p_counted: input.counted ?? null,
  });
  if (error) return { ok: false as const, error: arabicError(error.message) };
  const sessionId = data as unknown as string;
  forgetSession();
  // الحساب مشترك («كاشير»)؛ الاسم الذي كتبه الإنسان يُطبع على الوصل ويظهر في السجلّ
  const name = input.cashierName?.trim() || null;
  if (name) await supabase.rpc("set_session_cashier_name", { p_session: sessionId, p_name: name });
  /*
   * فُتحت الوردية → يُخبَر من راسلنا ونحن مغلقون.
   *
   * في `after` لا قبل الرجوع: فتح الدرج لا ينتظر واتساب. وخطؤه لا يُسقط
   * الوردية — البيع أهمّ من رسالة.
   */
  after(() => void flushWaiting().catch(() => {}));
  revalidatePath("/cashier");
  return { ok: true as const, sessionId };
}

/**
 * One line about the drawer, for the header on every screen.
 *
 * Whether the till is open is the first thing an owner wants to know on
 * opening the app, and it lived on exactly one page. Resolved from the
 * `getStaff()` the layout has already paid for, so it costs one query — not a
 * poll, and not another auth chain.
 */
export type ShiftLine = { open: boolean; float: number; sinceMinutes: number; cashier: string | null };

export async function currentShiftLine(): Promise<ShiftLine | null> {
  const staff = await getStaff();
  if (!staff) return null;

  const svc = createSupabaseServiceClient();
  const { data } = await svc
    .from("cashier_sessions")
    .select("opening_float, opened_at, cashier_id, cashier_name")
    .is("closed_at", null)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return { open: false, float: 0, sinceMinutes: 0, cashier: null };

  // the human's typed name first; the account name only for somebody else's drawer
  let cashier: string | null = data.cashier_name || null;
  if (!cashier && data.cashier_id && data.cashier_id !== staff.employeeId) {
    const { data: emp } = await svc.from("employees").select("name_ar").eq("id", data.cashier_id).maybeSingle();
    cashier = emp?.name_ar ?? null;
  }

  return {
    open: true,
    float: data.opening_float,
    sinceMinutes: Math.max(0, Math.round((Date.now() - new Date(data.opened_at).getTime()) / 60000)),
    cashier,
  };
}

/** Live Z-report for an open session — recomputed on every read. */
export async function sessionReport(sessionId: string): Promise<SessionReport | null> {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("session_report", { p_session: sessionId });
  // Returning null for every kind of failure collapsed «your token expired»,
  // «you are not staff» and «no such session» into one «…» on screen. The
  // caller shows whatever this throws, so the cashier reads the actual reason.
  if (error) throw new Error(arabicError(error.message));
  return (data?.[0] as SessionReport | undefined) ?? null;
}

/**
 * End the shift.
 *
 * `counted` is the physical count. `deposited` is what goes upstairs to
 * management and therefore leaves the drawer. Whatever remains is what the next
 * cashier will be asked to confirm.
 */
export async function closeSession(input: {
  sessionId: string;
  counted: number;
  deposited?: number;
  note?: string | null;
}) {
  // /cashier itself only asks for a staff session, so an expediter can reach
  // this screen — but counting the drawer down is not their job. Refused with a
  // sentence that says which of the two it is, because «لا يعمل» was all the
  // shop could report before.
  try {
    await requireRole("cashier");
  } catch {
    return { ok: false as const, error: "إنهاء الوردية للكاشير أو المدير فقط — سجّل الدخول بحساب الكاشير." };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("close_cashier_session", {
    p_session: input.sessionId,
    p_counted: Math.max(0, Math.round(input.counted) || 0),
    p_deposited: Math.max(0, Math.round(input.deposited ?? 0)),
    p_handover_to: null,
    p_note: input.note?.trim() || null,
  });
  forgetSession();
  if (error) return { ok: false as const, error: arabicError(error.message) };
  const row = data?.[0] as { expected_cash: number; variance: number } | undefined;
  revalidatePath("/cashier");
  revalidatePath("/dashboard");
  return { ok: true as const, expected: row?.expected_cash ?? 0, variance: row?.variance ?? 0 };
}

/** Owner view: every session for a business day, with its variance. */
export type SessionRow = {
  id: string;
  cashier_name: string;
  opened_at: string;
  closed_at: string | null;
  opening_float: number;
  counted_cash: number | null;
  deposited: number;
  expected_cash: number | null;
  variance: number | null;
  close_note: string | null;
  handover_confirmed_at: string | null;
  handover_counted: number | null;
  handover_amount: number | null;
};

export async function listSessions(businessDay: string): Promise<SessionRow[]> {
  await requireRole("cashier");
  const svc = createSupabaseServiceClient();
  const { data } = await svc
    .from("cashier_sessions")
    .select("id, cashier_id, opened_at, closed_at, opening_float, counted_cash, deposited, expected_cash, variance, close_note, handover_confirmed_at, handover_counted, handover_amount")
    .eq("business_day", businessDay)
    .order("opened_at", { ascending: true });
  if (!data?.length) return [];

  const ids = [...new Set(data.map((s) => s.cashier_id))];
  const { data: emps } = await svc.from("employees").select("id, name_ar").in("id", ids);
  const name = new Map((emps ?? []).map((e) => [e.id, e.name_ar]));

  return data.map((s) => ({ ...s, cashier_name: name.get(s.cashier_id) ?? "—" }));
}
