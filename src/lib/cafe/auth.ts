import { cache } from "react";
import { createHash } from "node:crypto";
import { getServerUser, createSupabaseServiceClient, currentAccessToken } from "@/lib/supabase/server";
import { toRole, type StaffRole } from "./roles";
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
  role: StaffRole | null;
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
    .select("id, name_ar, role_id, station_id, is_developer")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!emp) return null;

  let role: StaffRole | null = null;
  if (emp.role_id) {
    const { data: r } = await svc.from("roles").select("name_en").eq("id", emp.role_id).maybeSingle();
    role = toRole(r?.name_en);
  }
  const staff: Staff = {
    userId: user.id,
    employeeId: emp.id,
    name: emp.name_ar,
    email: user.email ?? null,
    role,
    stationId: emp.station_id ?? null,
    isDeveloper: emp.is_developer === true,
  };
  if (hubEnabled()) await rememberSession(token, staff);
  writeCache(token, staff);
  return staff;
}

export async function requireStaff(): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) throw new Error("غير مصرّح — سجّل الدخول.");
  return staff;
}

export async function requireAdmin(): Promise<Staff> {
  const staff = await requireStaff();
  if (staff.role !== "admin") throw new Error("هذه الصفحة للمدير فقط.");
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
  if (staff.role === "admin") return staff;
  if (!staff.role || !allowed.includes(staff.role)) {
    throw new Error("هذه الشاشة ليست ضمن صلاحيتك.");
  }
  return staff;
}
