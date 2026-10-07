"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAdmin, requireStaff } from "./auth";
import { COUPON_SAY, DEFAULT_DAYS, expiryFrom, normaliseCode, type CouponKind } from "./coupon";
import { normalizeIraqiPhone } from "./phone";

/**
 * الكوبونات — الجانب الخادمي.
 *
 * والحساب كلّه في القاعدة (`coupon_check` / `redeem_coupon` في 0120): العدّ
 * الذي يُنقص مالاً يُقفل صفّه ويُعدّ هناك، لا هنا ولا في متصفّح.
 *
 * وهذه الطبقة ثلاثة أشياء: الحراسة بالصلاحية، وترجمة سبب الرفض إلى كلامٍ
 * يُقرأ، وتصفية القائمة — **والتصفية في الخادم لا في الواجهة**: الكاشير يرى
 * ما أنشأه هو، والإدارة ترى الكل.
 */

export type CouponRow = {
  id: string;
  code: string;
  kind: CouponKind;
  value: number;
  item_name: string | null;
  phone: string | null;
  customer_name: string | null;
  max_uses: number;
  used_count: number;
  min_order: number | null;
  expires_on: string | null;
  note: string | null;
  is_active: boolean;
  created_at: string;
  created_by_name: string | null;
};

/** ما تقوله القاعدة، وما نقوله للناس. ورسالةٌ لكل حالة — «غير صالح» لا تُشخَّص */
function say(reason: string, minOrder?: number): string {
  if (reason === "min" && minOrder) return COUPON_SAY.min(minOrder);
  const m: Record<string, string> = {
    gone: COUPON_SAY.gone,
    off: COUPON_SAY.off,
    expired: COUPON_SAY.expired,
    used: COUPON_SAY.used,
    phone: COUPON_SAY.phone,
    empty: COUPON_SAY.empty,
  };
  return m[reason] ?? COUPON_SAY.gone;
}

export type CouponResult =
  | { ok: true; discount: number; code: string }
  | { ok: false; error: string };

/** يُنادى من شاشة الكاشير وقت البيع — ويَعدّ الاستخدام فوراً */
export async function redeemCoupon(code: string, subtotal: number, phone?: string | null): Promise<CouponResult> {
  await requireStaff();
  const clean = normaliseCode(code);
  if (!clean) return { ok: false, error: COUPON_SAY.empty };
  const svc = createSupabaseServiceClient();
  const { data, error } = await svc.rpc("redeem_coupon", {
    p_code: clean,
    p_subtotal: Math.max(0, Math.round(subtotal)),
    p_order: null,
    p_phone: phone ? normalizeIraqiPhone(phone) : null,
  });
  if (error) return { ok: false, error: "تعذّر الاتصال — جرّب ثانية." };
  const r = data as { ok: boolean; discount?: number; reason?: string; min_order?: number };
  if (!r?.ok) return { ok: false, error: say(r?.reason ?? "gone", r?.min_order) };
  return { ok: true, discount: r.discount ?? 0, code: clean };
}

/** فحصٌ بلا عدّ — لعرض قيمة الخصم قبل أن يُثبَّت */
export async function checkCoupon(code: string, subtotal: number, phone?: string | null): Promise<CouponResult> {
  const clean = normaliseCode(code);
  if (!clean) return { ok: false, error: COUPON_SAY.empty };
  const svc = createSupabaseServiceClient();
  const { data, error } = await svc.rpc("coupon_check", {
    p_code: clean,
    p_subtotal: Math.max(0, Math.round(subtotal)),
    p_phone: phone ? normalizeIraqiPhone(phone) : null,
  });
  if (error) return { ok: false, error: "تعذّر الاتصال — جرّب ثانية." };
  const r = data as { ok: boolean; discount?: number; reason?: string; min_order?: number };
  if (!r?.ok) return { ok: false, error: say(r?.reason ?? "gone", r?.min_order) };
  return { ok: true, discount: r.discount ?? 0, code: clean };
}

export type NewCoupon = {
  kind: CouponKind;
  value: number;
  itemId?: string | null;
  phone?: string | null;
  name?: string | null;
  uses?: number;
  minOrder?: number | null;
  days?: number;
  note?: string | null;
  /** الطلب الذي سبّب التعويض — لا الذي سيُستعمل فيه الكوبون */
  orderId?: string | null;
};

export type CreatedCoupon = { ok: true; code: string; expiresOn: string } | { ok: false; error: string };

/**
 * إنشاء كوبون — الكاشير يقدر، فهو من يقف أمام الزبون الذي استحقّ التعويض.
 *
 * ⚠ والقيمة تُحرَس هنا: نسبةٌ فوق ١٠٠ أو مبلغٌ سالب لا يصل القاعدة. وربط
 * الهاتف اختياري، لكنه **هو حراسة الرمز الحقيقية** — ستّة أحرف تُخمَّن.
 */
export async function createCoupon(input: NewCoupon): Promise<CreatedCoupon> {
  const staff = await requireStaff();
  const kind = input.kind;
  if (kind === "percent" && (input.value < 1 || input.value > 100)) {
    return { ok: false, error: "النسبة بين ١ و١٠٠." };
  }
  if (kind === "amount" && input.value < 250) return { ok: false, error: "اكتب مبلغ الخصم." };
  if (kind === "item" && !input.itemId) return { ok: false, error: "اختر الصنف المجاني." };

  const svc = createSupabaseServiceClient();
  const phone = input.phone ? normalizeIraqiPhone(input.phone) : null;

  // الصنف المجاني: قيمته سعره اليوم، فتُحفظ لحظة الإنشاء — ولو تغيّر السعر
  // لاحقاً بقي ما وُعد به الزبون كما وُعد.
  let value = Math.max(0, Math.round(input.value));
  if (kind === "item" && input.itemId) {
    const { data: it } = await svc.from("menu_items").select("price").eq("id", input.itemId).maybeSingle();
    value = Math.max(0, it?.price ?? 0);
  }

  const { data: code, error: ce } = await svc.rpc("gen_coupon_code");
  if (ce || !code) return { ok: false, error: "تعذّر توليد الرمز — جرّب ثانية." };

  let customerId: string | null = null;
  if (phone) {
    const { data: cust } = await svc.from("customers").select("id").eq("phone", phone).maybeSingle();
    customerId = cust?.id ?? null;
  }

  const expiresOn = expiryFrom(input.days ?? DEFAULT_DAYS);
  const { error } = await svc.from("coupons").insert({
    code: code as string,
    kind,
    value,
    item_id: kind === "item" ? input.itemId : null,
    customer_id: customerId,
    phone,
    max_uses: Math.max(1, Math.round(input.uses ?? 1)),
    min_order: input.minOrder && input.minOrder > 0 ? Math.round(input.minOrder) : null,
    expires_on: expiresOn,
    note: input.note?.trim() || null,
    order_id: input.orderId ?? null,
    created_by: staff.employeeId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/coupons");
  return { ok: true, code: code as string, expiresOn };
}

/** القائمة — والتصفية هنا لا في الواجهة: الكاشير يرى ما أنشأه هو */
export async function listCoupons(): Promise<CouponRow[]> {
  const staff = await requireStaff();
  const svc = createSupabaseServiceClient();
  let q = svc
    .from("coupons")
    .select("id, code, kind, value, phone, max_uses, used_count, min_order, expires_on, note, is_active, created_at, created_by, item_id, customer_id")
    .order("created_at", { ascending: false })
    .limit(200);
  if (!staff.isAdmin) q = q.eq("created_by", staff.employeeId);
  const { data } = await q;
  const rows = data ?? [];
  if (!rows.length) return [];

  const itemIds = [...new Set(rows.map((r) => r.item_id).filter(Boolean))] as string[];
  const empIds = [...new Set(rows.map((r) => r.created_by).filter(Boolean))] as string[];
  const custIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))] as string[];
  const [items, emps, custs] = await Promise.all([
    itemIds.length ? svc.from("menu_items").select("id, name_ar").in("id", itemIds) : Promise.resolve({ data: [] }),
    empIds.length ? svc.from("employees").select("id, name_ar").in("id", empIds) : Promise.resolve({ data: [] }),
    custIds.length ? svc.from("customers").select("id, name_ar").in("id", custIds) : Promise.resolve({ data: [] }),
  ]);
  const nameOf = (list: { data: { id: string; name_ar: string | null }[] | null }) =>
    new Map((list.data ?? []).map((x) => [x.id, x.name_ar]));
  const itemName = nameOf(items as never);
  const empName = nameOf(emps as never);
  const custName = nameOf(custs as never);

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    kind: r.kind as CouponKind,
    value: r.value,
    item_name: r.item_id ? itemName.get(r.item_id) ?? null : null,
    phone: r.phone,
    customer_name: r.customer_id ? custName.get(r.customer_id) ?? null : null,
    max_uses: r.max_uses,
    used_count: r.used_count,
    min_order: r.min_order,
    expires_on: r.expires_on,
    note: r.note,
    is_active: r.is_active,
    created_at: r.created_at,
    created_by_name: r.created_by ? empName.get(r.created_by) ?? null : null,
  }));
}

/** إيقاف كوبون — ولا يُحذف: سجلّ ما خُصم يبقى */
export async function toggleCoupon(id: string): Promise<{ ok: boolean }> {
  const staff = await requireStaff();
  const svc = createSupabaseServiceClient();
  const { data: c } = await svc.from("coupons").select("is_active, created_by").eq("id", id).maybeSingle();
  if (!c) return { ok: false };
  if (!staff.isAdmin && c.created_by !== staff.employeeId) return { ok: false };
  await svc.from("coupons").update({ is_active: !c.is_active }).eq("id", id);
  revalidatePath("/coupons");
  return { ok: true };
}

/** ما كلّفتنا الكوبونات — للإدارة وحدها */
export async function couponCost(fromDay: string, toDay: string): Promise<{ count: number; amount: number }> {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  const { data } = await svc
    .from("coupon_redemptions")
    .select("amount")
    .gte("business_day", fromDay)
    .lte("business_day", toDay);
  const rows = data ?? [];
  return { count: rows.length, amount: rows.reduce((t, r) => t + (r.amount ?? 0), 0) };
}
