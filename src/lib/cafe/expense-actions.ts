"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { openSessionIdFor } from "./session-of";
import { requireAdmin, requireStaff } from "./auth";
import { businessDay } from "./time";
import { STAFF_ADVANCE } from "./wages";

export type ExpenseRow = {
  id: string;
  business_day: string;
  amount: number;
  category: string | null;
  note: string | null;
  /** اسم شركة المشتريات إن نُسب إليها — «—» حين لا شركة، وهو مقبول */
  supplier: string | null;
};

/** Any staff member records expenses (the cashier pays for ice, milk, …).
 *  Service client behind the staff gate — expenses has admin-only RLS. */
/**
 * سلفة موظف — سحب نقدي على الراتب.
 *
 * تمرّ من addExpense عمداً بدل جدول خاصّ بها: السلفة نقد يخرج من الدرج، وهذا
 * تعريف المصروف. فترث ربطها بالوردية المفتوحة، وطرحها من النقد المتوقَّع،
 * وظهورها في تقرير الوردية وفي جرد اليوم — كلها مبنية أصلاً.
 *
 * والفرق الوحيد أنها تحمل اسم صاحبها، ليُطرح المبلغ من راتبه آخر الشهر.
 */
export async function addStaffAdvance(input: { employeeId: string; amount: number; note?: string }) {
  const staff = await requireStaff();
  const amount = Math.max(0, Math.round(input.amount));
  if (amount <= 0) return { ok: false as const, error: "أدخل مبلغاً صحيحاً." };
  if (!input.employeeId) return { ok: false as const, error: "اختر الموظف." };

  const svc = createSupabaseServiceClient();
  const { error } = await svc.from("expenses").insert({
    amount,
    session_id: await openSessionIdFor(staff.employeeId),
    category: STAFF_ADVANCE,
    employee_id: input.employeeId,
    note: input.note?.trim() || null,
    business_day: businessDay(),
    created_by: staff.employeeId,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/expenses");
  revalidatePath("/daily");
  return { ok: true as const };
}

export async function addExpense(input: { amount: number; category?: string; note?: string; businessDay?: string | null; supplierId?: string | null }) {
  const staff = await requireStaff();
  const amount = Math.max(0, Math.round(input.amount));
  if (amount <= 0) return { ok: false as const, error: "أدخل مبلغاً صحيحاً." };

  // بتاريخ سابق: النظام اعتُمد في منتصف الشهر، وأوّله كان على الورق. يوم في
  // الماضي يُقبل؛ يوم في المستقبل لا. والفارغ يعني اليوم كما كان دائماً.
  const today = businessDay();
  const day = input.businessDay?.trim() || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today) return { ok: false as const, error: "التاريخ غير صالح أو في المستقبل." };
  const backdated = day !== today;

  const svc = createSupabaseServiceClient();
  // attribute it to whichever drawer is open — this is what makes the
  // Z-report subtract the right expenses from the right cashier.
  // إلا المؤرَّخ في الماضي: لا يُلصق بدرج الليلة، وإلا ظهر عجزٌ في جرد اليوم
  // عن مصروف صُرف قبل أسبوع.
  const session_id = backdated ? null : await openSessionIdFor(staff.employeeId);
  const { error } = await svc.from("expenses").insert({
    amount,
    session_id,
    category: input.category?.trim() || null,
    note: input.note?.trim() || null,
    business_day: day,
    created_by: staff.employeeId,
    supplier_id: input.supplierId || null,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

/** Admin sees the full history; the cashier sees today's expenses only. */
export async function listExpenses(limit = 60): Promise<ExpenseRow[]> {
  const staff = await requireStaff();
  const svc = createSupabaseServiceClient();
  let q = svc
    .from("expenses")
    .select("id, business_day, amount, category, note, supplier_id")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!staff.isAdmin) q = q.eq("business_day", businessDay());
  const { data } = await q;
  const rows = data ?? [];

  // الاسم باستعلام ثانٍ وخريطة — نفس نمط listSessions: الأنواع مكتوبة بيد،
  // فلا تعرف المفتاح الأجنبي ولا يستعمل أحد التضمين.
  const ids = [...new Set(rows.map((r) => r.supplier_id).filter((x): x is string => !!x))];
  const nameOf = new Map<string, string>();
  if (ids.length) {
    const { data: sup } = await svc.from("suppliers").select("id, name_ar").in("id", ids);
    for (const x of sup ?? []) nameOf.set(x.id, x.name_ar);
  }
  return rows.map((r) => ({
    id: r.id,
    business_day: r.business_day,
    amount: r.amount,
    category: r.category,
    note: r.note,
    supplier: (r.supplier_id && nameOf.get(r.supplier_id)) || null,
  }));
}

// ── daily register closure (إغلاق الصندوق) ──────────────────────────────────

export type RegisterClosure = { business_day: string; remaining: number; note: string | null };

/** Record how much cash stays in the drawer at close (upsert — re-saving
 *  the same day just updates the amount). */
export async function saveRegisterClosure(input: { remaining: number; note?: string }) {
  const staff = await requireStaff();
  const remaining = Math.max(0, Math.round(input.remaining));
  const svc = createSupabaseServiceClient();
  const { error } = await svc.from("register_closures").upsert(
    {
      business_day: businessDay(),
      remaining,
      note: input.note?.trim() || null,
      closed_by: staff.name,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "business_day" },
  );
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/expenses");
  return { ok: true as const };
}

// ── fixed monthly costs (الإيجار/الكهرباء/المولد/المياه) ────────────────────

export type MonthlyCost = { category: string; amount: number };

/** The fixed monthly-cost baseline. Any staff can view (feeds the summary). */
export async function getMonthlyCosts(): Promise<MonthlyCost[]> {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  const { data } = await svc.from("monthly_costs").select("category, amount");
  return (data ?? []) as MonthlyCost[];
}

/** Set the fixed monthly amounts (admin only — it changes the profit math). */
export async function saveMonthlyCosts(items: MonthlyCost[]) {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  const rows = items.map((i) => ({ category: i.category, amount: Math.max(0, Math.round(i.amount || 0)), updated_at: new Date().toISOString() }));
  const { error } = await svc.from("monthly_costs").upsert(rows, { onConflict: "category" });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

/** Today's saved closure (if any) + the most recent previous one. */
export async function getRegisterClosures(): Promise<{ today: RegisterClosure | null; previous: RegisterClosure | null }> {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  const { data } = await svc
    .from("register_closures")
    .select("business_day, remaining, note")
    .order("business_day", { ascending: false })
    .limit(2);
  const rows = (data ?? []) as RegisterClosure[];
  const day = businessDay();
  const today = rows.find((r) => r.business_day === day) ?? null;
  const previous = rows.find((r) => r.business_day !== day) ?? null;
  return { today, previous };
}

/**
 * حذف مصروف — للخطأ في الإدخال.
 *
 * الكاشير يحذف مصروف اليوم فقط: رقم كُتب خطأً قبل دقيقة يُصحَّح على الفور،
 * أما مصروف أمس فقد دخل جرداً أُقفل وصار تاريخاً. الإدارة تحذف أيّ يوم.
 */
export async function deleteExpense(id: string) {
  const staff = await requireStaff();
  const svc = createSupabaseServiceClient();
  const { data: x } = await svc.from("expenses").select("id, business_day").eq("id", id).maybeSingle();
  if (!x) return { ok: false as const, error: "المصروف غير موجود." };
  if (!staff.isAdmin && x.business_day !== businessDay()) {
    return { ok: false as const, error: "مصروف يوم سابق — يحذفه المدير." };
  }
  const { error } = await svc.from("expenses").delete().eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

/* ── مبيعات يوم سابق — رقم واحد لكل يوم، للإدارة ─────────────────────────────
 *
 * أيام ما قبل الاعتماد لم تُسجَّل طلباتها؛ يُدخل مجموعها نقداً وبطاقةً فيظهر
 * في تقرير الشهر (range_summary تضمّه). لا ربح ولا عدد طلبات — لا يُعرفان.
 */
export type ManualSale = { business_day: string; cash: number; card: number; note: string | null };

export async function listManualSales(): Promise<ManualSale[]> {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  const { data } = await svc
    .from("manual_daily_sales")
    .select("business_day, cash, card, note")
    .order("business_day", { ascending: false })
    .limit(60);
  return (data ?? []) as ManualSale[];
}

export async function saveManualSale(input: { businessDay: string; cash: number; card: number; note?: string | null }) {
  const staff = await requireAdmin();
  const today = businessDay();
  const day = input.businessDay?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today) return { ok: false as const, error: "التاريخ غير صالح أو في المستقبل." };
  const cash = Math.max(0, Math.round(input.cash || 0));
  const card = Math.max(0, Math.round(input.card || 0));
  if (cash + card <= 0) return { ok: false as const, error: "أدخل مبلغاً." };

  const svc = createSupabaseServiceClient();
  const { error } = await svc.from("manual_daily_sales").upsert({
    business_day: day,
    cash,
    card,
    note: input.note?.trim() || null,
    created_by: staff.employeeId,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

export async function deleteManualSale(businessDay: string) {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  const { error } = await svc.from("manual_daily_sales").delete().eq("business_day", businessDay);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

/**
 * شركات المشتريات — بيبسي، طاحونة السنابل، علوة السدة.
 *
 * تُصرف لها مبالغ يومياً أو أسبوعياً، وكان المصروف يحمل تصنيفاً نصّياً حرّاً
 * فقط، فلا يُعرف كم صُرف لشركة بعينها ولا رقم مندوبها حين يتأخّر.
 *
 * لا ذمم ولا تسويات: المصروف هو الدفعة نفسها. و«كم دفعنا لبيبسي هذا الشهر»
 * تجميعٌ على supplier_id، موجود بمجرد وجود العمود.
 */
export type Supplier = {
  id: string;
  name_ar: string;
  phone1: string | null;
  phone2: string | null;
  is_active: boolean;
};

/** القائمة التي يختار منها الكاشير. النشطة فقط — والمعطَّلة تبقى في المصروفات القديمة. */
export async function listSuppliers(activeOnly = true): Promise<Supplier[]> {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  let q = svc.from("suppliers").select("id, name_ar, phone1, phone2, is_active").order("sort").order("name_ar");
  if (activeOnly) q = q.eq("is_active", true);
  const { data } = await q;
  return (data ?? []) as Supplier[];
}

export async function saveSupplier(input: {
  id?: string | null;
  name: string;
  phone1?: string | null;
  phone2?: string | null;
  active?: boolean;
  note?: string | null;
}) {
  await requireAdmin();
  const name = input.name.trim();
  if (!name) return { ok: false as const, error: "اكتب اسم الشركة." };
  const svc = createSupabaseServiceClient();
  const { error } = await svc.rpc("save_supplier", {
    p_id: input.id ?? null,
    p_name: name,
    p_phone1: input.phone1?.trim() || null,
    p_phone2: input.phone2?.trim() || null,
    p_active: input.active ?? true,
    p_note: input.note?.trim() || null,
  });
  if (error) {
    return {
      ok: false as const,
      error: /duplicate key|unique/i.test(error.message) ? "هذا الاسم مسجّل مسبقاً." : error.message,
    };
  }
  revalidatePath("/suppliers");
  revalidatePath("/expenses");
  return { ok: true as const };
}
