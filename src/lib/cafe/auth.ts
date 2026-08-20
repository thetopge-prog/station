import { getServerUser, createSupabaseServiceClient } from "@/lib/supabase/server";
import { toRole, type StaffRole } from "./roles";

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
};

/** The current signed-in staff member, or null. Uses the service client to read
 *  the employees/roles tables reliably (after the auth token is validated). */
export async function getStaff(): Promise<Staff | null> {
  const user = await getServerUser();
  if (!user) return null;

  const svc = createSupabaseServiceClient();
  const { data: emp } = await svc
    .from("employees")
    .select("id, name_ar, role_id, station_id")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!emp) return null;

  let role: StaffRole | null = null;
  if (emp.role_id) {
    const { data: r } = await svc.from("roles").select("name_en").eq("id", emp.role_id).maybeSingle();
    role = toRole(r?.name_en);
  }
  return {
    userId: user.id,
    employeeId: emp.id,
    name: emp.name_ar,
    email: user.email ?? null,
    role,
    stationId: emp.station_id ?? null,
  };
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
export async function requireRole(...allowed: StaffRole[]): Promise<Staff> {
  const staff = await requireStaff();
  if (staff.role === "admin") return staff;
  if (!staff.role || !allowed.includes(staff.role)) {
    throw new Error("هذه الشاشة ليست ضمن صلاحيتك.");
  }
  return staff;
}
