"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAdmin, forgetStaffCache } from "./auth";
import type { ShiftPeriod } from "./work-shift";
import { STAFF_ROLES, type StaffRole } from "./roles";

/**
 * Staff logins, created from inside the system.
 *
 * This used to be scripts/create-user.mjs, which meant every new hire required
 * somebody with the repository, Node, and the service key on their laptop. A
 * restaurant hires people on a Tuesday afternoon.
 *
 * Same rules as the script, because both write the same two rows:
 *   · a login without "@" becomes <login>@station.iq — that mapping is what
 *     makes signing in with a phone number work, and the sign-in form applies
 *     it identically.
 *   · find-or-create, then force the password. So the create form is also the
 *     "forgot my password" form, and there is only one path to maintain.
 */

export type AccountRow = {
  employeeId: string;
  name_ar: string;
  login: string;
  /** الأساسية — للعرض المختصر */
  role: StaffRole | null;
  /** كلها، لعرضها ولملء النموذج عند التعديل */
  roles: StaffRole[];
  shift_period: ShiftPeriod | null;
  station: string | null;
  is_active: boolean;
  is_developer: boolean;
  last_sign_in: string | null;
};

const emailFor = (login: string) => (login.includes("@") ? login.trim() : `${login.trim()}@station.iq`);
const loginOf = (email: string | undefined) => (email ?? "").replace(/@station\.iq$/i, "");

export async function listAccounts(): Promise<AccountRow[]> {
  await requireAdmin();
  const svc = createSupabaseServiceClient();

  const [{ data: emps }, { data: roles }, { data: stations }, { data: links }, users] = await Promise.all([
    svc
      .from("employees")
      .select("id, name_ar, role_id, station_id, auth_user_id, is_active, is_developer, shift_period")
      .order("created_at"),
    svc.from("roles").select("id, name_en"),
    svc.from("stations").select("id, name_ar"),
    svc.from("employee_roles").select("employee_id, role_id"),
    svc.auth.admin.listUsers(),
  ]);

  const roleName = new Map((roles ?? []).map((r) => [r.id, r.name_en as StaffRole]));
  const stationName = new Map((stations ?? []).map((s) => [s.id, s.name_ar]));
  const byId = new Map((users.data?.users ?? []).map((u) => [u.id, u]));
  const rolesOf = new Map<string, StaffRole[]>();
  for (const l of links ?? []) {
    const n = roleName.get(l.role_id);
    if (n) rolesOf.set(l.employee_id, [...(rolesOf.get(l.employee_id) ?? []), n]);
  }

  return (emps ?? [])
    .filter((e) => e.auth_user_id)
    .map((e) => {
      const u = byId.get(e.auth_user_id!);
      return {
        employeeId: e.id,
        name_ar: e.name_ar,
        login: loginOf(u?.email),
        role: e.role_id ? roleName.get(e.role_id) ?? null : null,
        roles: rolesOf.get(e.id) ?? (e.role_id && roleName.get(e.role_id) ? [roleName.get(e.role_id)!] : []),
        shift_period: (e.shift_period as ShiftPeriod | null) ?? null,
        station: e.station_id ? stationName.get(e.station_id) ?? null : null,
        is_active: e.is_active,
        is_developer: e.is_developer === true,
        last_sign_in: u?.last_sign_in_at ?? null,
      };
    });
}

export type SaveAccountInput = {
  login: string;
  password: string;
  name_ar: string;
  /** الصلاحية الأولى — تبقى الأساسية في العمود القديم */
  role?: StaffRole;
  /** كل صلاحياته. عمر محمد: ["cashier","expediter"] */
  roles?: StaffRole[];
  /** morning ٩–٣ · evening ٣–٣ · فارغ = بلا قيد وقت */
  shiftPeriod?: ShiftPeriod | null;
  /** chefs only — a chef's KDS shows one station, so it lives on the account */
  stationEn?: string | null;
};

export async function saveAccount(input: SaveAccountInput) {
  await requireAdmin();

  const login = input.login.trim();
  const name = input.name_ar.trim();
  if (!login) return { ok: false as const, error: "أدخل رقم الهاتف أو اسم الدخول." };
  if (!name) return { ok: false as const, error: "أدخل اسم الموظف." };
  // صلاحية واحدة أو أكثر: عمر محمد كاشير ومجهّز معاً. و input.role تبقى مقبولة
  // كي لا ينكسر أي مستدعٍ قديم.
  const wanted = (input.roles?.length ? input.roles : input.role ? [input.role] : []).filter((r) =>
    STAFF_ROLES.includes(r),
  );
  if (wanted.length === 0) return { ok: false as const, error: "اختر صلاحية واحدة على الأقل." };
  // Supabase rejects anything shorter, and a till that half a shift can guess
  // is worse than no login at all
  if (input.password.length < 8) return { ok: false as const, error: "كلمة المرور ٨ أحرف على الأقل." };

  const svc = createSupabaseServiceClient();
  const email = emailFor(login);

  // 1) the auth user — created, or found and given the new password
  let userId: string | undefined;
  const created = await svc.auth.admin.createUser({ email, password: input.password, email_confirm: true });
  userId = created.data?.user?.id;
  if (!userId) {
    if (created.error && !/registered|exists/i.test(created.error.message)) {
      return { ok: false as const, error: created.error.message };
    }
    const { data: list } = await svc.auth.admin.listUsers();
    userId = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
    if (!userId) return { ok: false as const, error: "تعذّر إنشاء الحساب." };
    const upd = await svc.auth.admin.updateUserById(userId, { password: input.password });
    if (upd.error) return { ok: false as const, error: upd.error.message };
  }

  // 2) roles
  const { data: roleRows } = await svc.from("roles").select("id, name_en").in("name_en", wanted);
  if (!roleRows || roleRows.length !== wanted.length) {
    return { ok: false as const, error: "إحدى الصلاحيات غير موجودة في القاعدة." };
  }
  // الأولى تبقى الأساسية في العمود القديم، فتعمل كل شيفرة تقرأ role كما هي
  const primaryId = roleRows.find((r) => r.name_en === wanted[0])!.id;

  let stationId: string | null = null;
  if (input.stationEn) {
    const { data: st } = await svc.from("stations").select("id").eq("name_en", input.stationEn).maybeSingle();
    if (!st) return { ok: false as const, error: "المحطة غير موجودة." };
    stationId = st.id;
  }

  // 3) the employee row, linked to the login
  const { data: existing } = await svc.from("employees").select("id").eq("auth_user_id", userId).maybeSingle();
  const row = {
    name_ar: name,
    role_id: primaryId,
    station_id: stationId,
    is_active: true,
    shift_period: input.shiftPeriod ?? null,
  };
  const { data: saved, error } = existing
    ? await svc.from("employees").update(row).eq("id", existing.id).select("id").maybeSingle()
    : await svc.from("employees").insert({ ...row, auth_user_id: userId }).select("id").maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  const employeeId = saved?.id ?? existing?.id;
  if (!employeeId) return { ok: false as const, error: "تعذّر حفظ الموظف." };

  // 4) الصلاحيات: تُستبدل كاملةً لا تُضاف — فإزالة صلاحية من النموذج تعني إزالتها
  const { error: delErr } = await svc.from("employee_roles").delete().eq("employee_id", employeeId);
  if (delErr) return { ok: false as const, error: delErr.message };
  const { error: insErr } = await svc
    .from("employee_roles")
    .insert(roleRows.map((r) => ({ employee_id: employeeId, role_id: r.id })));
  if (insErr) return { ok: false as const, error: insErr.message };

  // تغيير الصلاحية يجب أن يسري الآن، لا بعد دقيقة من ذاكرة الجلسة
  forgetStaffCache();
  revalidatePath("/employees");
  return { ok: true as const, login, email };
}

/** Take someone off the floor without erasing a year of their orders. */
export async function setAccountActive(employeeId: string, is_active: boolean) {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  const { error } = await svc.from("employees").update({ is_active }).eq("id", employeeId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/employees");
  return { ok: true as const };
}
