import { cache } from "react";
import { createHash } from "node:crypto";
import { getServerUser, createSupabaseServiceClient, currentAccessToken } from "@/lib/supabase/server";
import { canAccess, toRole, type StaffRole } from "./roles";
import { type ShiftPeriod } from "./work-shift";
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
  /*
   * سؤال واحد لا ثلاثة: الموظف ودوره الأساسي (العمود القديم، احتياطاً) وأدواره
   * من جدول الربط (0062) في استعلام واحد مضمَّن. القاعدة على بعد ~300 مللي ثانية،
   * وكل سؤال متتابع هو ثلث ثانية يقفها الكاشير أمام الزبون.
   */
  // roles!employees_role_id_fkey: الجدولان مرتبطان بطريقين (العمود القديم وجدول
  // الربط) وPostgREST يرفض التخمين — بلا التلميح أُقفل الدخول على الجميع صباح ١٥/٩
  const { data: raw, error: empErr } = await svc
    .from("employees")
    .select("id, name_ar, role_id, station_id, is_developer, shift_period, roles!employees_role_id_fkey(name_en), employee_roles(roles(name_en))")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  const emp = raw as unknown as {
    id: string; name_ar: string; role_id: string | null; station_id: string | null; is_developer: boolean | null; shift_period: string | null;
    roles: { name_en: string } | null;
    employee_roles: { roles: { name_en: string } | null }[] | null;
  } | null;
  // خطأ في الاستعلام ليس «لا موظف»: لا تُقفل الأبواب على الجميع بسبب سطر select
  if (empErr) throw new Error(`staff lookup failed: ${empErr.message}`);
  if (!emp) return null;

  const names = (emp.employee_roles ?? []).map((r) => toRole(r.roles?.name_en)).filter((r): r is StaffRole => r !== null);
  const primary = toRole(emp.roles?.name_en);
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
 * سجّل حضور الموظف. لا منع.
 *
 * كانت هذه بوّابة تُخرج الكاشير إلى /off-shift حين تنتهي نافذة ورديته. قال
 * المالك: «لا تسجّل خروجاً إجبارياً بل احسب له دواماً إضافياً» — الإخراج وسط
 * طلب مفتوح ووردية مالية مفتوحة يعطّل البيع، والوقت خارج النافذة يظهر في
 * صفحة الحضور عموداً «إضافي» يقرؤه المدير ويحاسب عليه.
 *
 * المدير ومن بلا وردية (الحسابات المشتركة) لا حضور لهم هنا كما كان.
 */
const ATTENDANCE_TTL_MS = 10 * 60_000;
const attendanceTouched = new Map<string, number>();

async function guardShift(staff: Staff): Promise<void> {
  if (staff.isAdmin || !staff.shiftPeriod) return;
  // كانت تُستدعى مع كل فعل — ثلث ثانية إضافية على كل نقرة للكاشير ذي الوردية،
  // وهو من اشتكى البطء. السطر لا يُفتح إلا مرّة، فيكفي سؤال كل عشر دقائق.
  const last = attendanceTouched.get(staff.employeeId) ?? 0;
  if (Date.now() - last < ATTENDANCE_TTL_MS) return;
  attendanceTouched.set(staff.employeeId, Date.now());
  const svc = createSupabaseServiceClient();
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
 * المدير أو المطوّر.
 *
 * المطوّر محورٌ مستقل عن الدور (0046): تشغيل مطعم وتركيبه عملان مختلفان. لكن
 * إنشاء الحسابات يقع في الاثنين — فمن يُركّب محلاً جديداً يحتاج أن يصنع حساب
 * مديره قبل أن يوجد مدير.
 */
export async function requireAdminOrDeveloper(): Promise<Staff> {
  const staff = await requireStaff();
  if (!staff.isAdmin && !staff.isDeveloper) throw new Error("هذه الصفحة للمدير أو المطوّر.");
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
