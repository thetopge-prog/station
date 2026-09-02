import { cache } from "react";
import { createHash } from "node:crypto";
import { getServerUser, createSupabaseServiceClient, currentAccessToken } from "@/lib/supabase/server";
import { canAccess, toRole, type StaffRole } from "./roles";
import { inShift, shiftDeniedMessage, workDay, type ShiftPeriod } from "./work-shift";
import { hubEnabled } from "@/lib/hub/store";
import { cloudReachable } from "@/lib/hub/net";
import { rememberSession, recallSession } from "@/lib/hub/session";

// Re-exported so existing server-side imports of StaffRole/canAccess from this
// module keep working. The definitions live in ./roles because that file has no
// server-only dependencies and client components need it too.
export { STAFF_ROLES, ROLE_AR, canAccess, type StaffRole } from "./roles";

/** Resolved staff identity. Server-only. */
export type Staff = {
  userId: string;
  employeeId: string;
  name: string;
  email: string | null;
  /** الصلاحية الأساسية — تبقى للعرض وللتوافق مع ما كُتب قبل تعدّد الصلاحيات */
  role: StaffRole | null;
  /** كل صلاحياته. عمر محمد: كاشير ومجهّز معاً. */
  roles: StaffRole[];
  /** مدير؟ — محسوبة مرّة هنا بدل خمسة عشر `role === "admin"` تتفرّق في الشيفرة */
  isAdmin: boolean;
  /** وردية الدوام، وفارغها «بلا قيد وقت» — وهو حال الحسابات المشتركة */
  shiftPeriod: ShiftPeriod | null;
  /** which kitchen station a chef sees on the KDS; null for every other role */
  stationId: string | null;
  /** sees /setup. A separate axis from `role`: running a restaurant and
   *  installing one are different jobs, and an admin is only the first. */
  isDeveloper: boolean;
};

/**
 * ── Why this is cached, twice ─────────────────────────────────────────────
 *
 * Resolving one staff member costs THREE sequential round trips: validate the
 * token against Supabase Auth, read `employees`, read `roles`. The database is
 * in ap-northeast-1 and a round trip from Iraq measures ~320ms, so that is
 * roughly a second of latency — and there are ~124 gate call sites across 35
 * files. A single dashboard load resolved the same cookie nine times.
 *
 * Two layers, because they solve different halves:
 *
 *   1. `cache()` — React's per-request memo. Ten gates in one page load become
 *      one resolution. Correct by construction: a request cannot outlive
 *      itself, so nothing can go stale inside it.
 *
 *   2. A short TTL keyed by the token's SHA-256. This is what makes a 4-second
 *      poll cost nothing: the second tick reuses the first tick's answer.
 *
 * The trade-off of layer 2, stated plainly: a session revoked in Supabase stays
 * usable here for up to STAFF_TTL_MS. Sixty seconds is short enough that firing
 * somebody mid-shift still locks them out within a minute, and long enough that
 * the polling screens stop paying for auth at all. The token itself is never
 * stored — only its hash — so this map is not a credential store.
 */
const STAFF_TTL_MS = 60_000;
/** a busy shop has a handful of signed-in devices; this is a safety valve */
const STAFF_CACHE_MAX = 50;

const staffCache = new Map<string, { at: number; staff: Staff | null }>();

const keyOf = (token: string) => createHash("sha256").update(token).digest("hex");

function readCache(token: string | null): { staff: Staff | null } | null {
  if (!token) return null;
  const hit = staffCache.get(keyOf(token));
  if (!hit) return null;
  if (Date.now() - hit.at > STAFF_TTL_MS) {
    staffCache.delete(keyOf(token));
    return null;
  }
  return { staff: hit.staff };
}

function writeCache(token: string | null, staff: Staff | null) {
  if (!token) return;
  if (staffCache.size >= STAFF_CACHE_MAX) {
    // oldest first; a Map iterates in insertion order
    const oldest = staffCache.keys().next().value;
    if (oldest) staffCache.delete(oldest);
  }
  staffCache.set(keyOf(token), { at: Date.now(), staff });
}

/** Forget a cached identity — call after anything that changes who someone is. */
export function forgetStaffCache() {
  staffCache.clear();
}

/** The current signed-in staff member, or null. Uses the service client to read
 *  the employees/roles tables reliably (after the auth token is validated). */
export const getStaff = cache(resolveStaff);

async function resolveStaff(): Promise<Staff | null> {
  // read once: it is both the cache key and, on the hub, the offline identity
  const token = await currentAccessToken();
  const cached = readCache(token);
  if (cached) return cached.staff;

  const user = await getServerUser();
  if (!user) {
    // On the shop hub with the line down, fall back to the identity Supabase
    // already confirmed for this exact token. Everywhere else, and whenever the
    // cloud is reachable, a failed check stays a failed check.
    if (hubEnabled() && token && !(await cloudReachable())) return recallSession(token);
    writeCache(token, null);
    return null;
  }

  const svc = createSupabaseServiceClient();
  const { data: emp } = await svc
    .from("employees")
    .select("id, name_ar, role_id, station_id, is_developer, shift_period")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!emp) return null;

  /*
   * كل الصلاحيات من جدول الربط، والعمود القديم احتياطاً.
   *
   * الترحيل 0062 ملأ الجدول من العمود، فهما متطابقان اليوم. لكن الاحتياط يبقى:
   * موظف يُضاف بالطريقة القديمة، أو ملءٌ يفشل، لا ينبغي أن يُفقد صلاحيته كلها.
   */
  const { data: linked } = await svc
    .from("employee_roles")
    .select("roles(name_en)")
    .eq("employee_id", emp.id);
  const names = ((linked ?? []) as unknown as { roles: { name_en: string } | null }[])
    .map((r) => toRole(r.roles?.name_en))
    .filter((r): r is StaffRole => r !== null);

  let primary: StaffRole | null = null;
  if (emp.role_id) {
    const { data: r } = await svc.from("roles").select("name_en").eq("id", emp.role_id).maybeSingle();
    primary = toRole(r?.name_en);
  }
  const roles = [...new Set([...names, ...(primary ? [primary] : [])])];

  const staff: Staff = {
    userId: user.id,
    employeeId: emp.id,
    name: emp.name_ar,
    email: user.email ?? null,
    role: primary ?? roles[0] ?? null,
    roles,
    isAdmin: roles.includes("admin"),
    shiftPeriod: (emp.shift_period as ShiftPeriod | null) ?? null,
    stationId: emp.station_id ?? null,
    isDeveloper: emp.is_developer === true,
  };
  if (hubEnabled()) await rememberSession(token, staff);
  writeCache(token, staff);
  return staff;
}

/**
 * البوّابة التي يمرّ بها كل طلب — وهنا يقع منع الوردية وتسجيل الحضور.
 *
 * موضعها هذا مقصود: أي شاشة وأي إجراء يمرّ من هنا، فلا يبقى بابٌ خلفيّ يُنسى.
 * والكلفة صفر تقريباً لأن نتيجة getStaff مخزّنة ستّين ثانية، فالفحص يجري مرّة
 * كل دقيقة لا مع كل نقرة.
 */
export async function requireStaff(): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) throw new Error("غير مصرّح — سجّل الدخول.");
  await guardShift(staff);
  return staff;
}

/**
 * هل هذا الموظف داخل وقته؟ وإن كان، سجّل حضوره.
 *
 * أربعة مخارج قبل المنع، لأن الخطأ هنا **يوقف البيع** لا يزعج مستخدماً:
 * المدير لا يُمنع · ومن بلا وردية لا يُمنع (وهو حال الحسابات المشتركة كلها) ·
 * ومهلة ساعة على الطرفين · واستثناء من الإدارة ليوم بعينه.
 */
async function guardShift(staff: Staff): Promise<void> {
  if (staff.isAdmin || !staff.shiftPeriod) return;

  const svc = createSupabaseServiceClient();
  if (!inShift(staff.shiftPeriod)) {
    const { data: pass } = await svc
      .from("shift_exceptions")
      .select("employee_id")
      .eq("employee_id", staff.employeeId)
      .eq("work_day", workDay())
      .maybeSingle();
    if (!pass) throw new Error(shiftDeniedMessage(staff.shiftPeriod));
  }

  // الحضور: يفتح سطراً إن لم يكن مفتوحاً، ولا يفعل شيئاً إن كان. تلقائي مع
  // الدخول كما اختار صاحب المحل — والحسابات المشتركة لا تصل هنا أصلاً، فلا
  // يُسجَّل حضورٌ باسم «كاشير» بدل إنسان.
  await svc.rpc("attendance_open", { p_employee: staff.employeeId, p_shift: staff.shiftPeriod });
}

export async function requireAdmin(): Promise<Staff> {
  const staff = await requireStaff();
  if (!staff.isAdmin) throw new Error("هذه الصفحة للمدير فقط.");
  return staff;
}

/**
 * Gate a screen on a job type. The owner passes every gate — a manager standing
 * at the expediter station during a rush should never be locked out of it.
 */
/** The installation surface. Not the same gate as admin — see 0046. */
export async function requireDeveloper(): Promise<Staff> {
  const staff = await requireStaff();
  if (!staff.isDeveloper) throw new Error("هذه الصفحة للمطوّر فقط.");
  return staff;
}

export async function requireRole(...allowed: StaffRole[]): Promise<Staff> {
  const staff = await requireStaff();
  if (!canAccess(staff.roles, allowed)) {
    throw new Error("هذه الشاشة ليست ضمن صلاحيتك.");
  }
  return staff;
}
