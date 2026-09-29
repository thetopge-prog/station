"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "./auth";
import { bustMenuCache } from "./menu-data";
import { cleanInstagram, idFingerprint, referralKey, REFERRAL_POINTS, studentFormError } from "./student";
import type { StudentStatus } from "@/lib/types";

/**
 * منيو الطلاب — الأفعال.
 *
 * نصفُه عامّ (يناديه طالبٌ بلا حساب) ونصفُه للمدير. والفصل بينهما في العميل
 * المستعمل: العامّ يمرّ على `anon` ولا يلمس إلا دالّتين مُحكَمتين
 * (`register_student`, `student_by_token`)، والإداري يمرّ على مفتاح الخدمة
 * خلف `requireAdmin`. ولا شيء بينهما.
 */

// ═══ العامّ ══════════════════════════════════════════════════════════════

export type RegisterInput = {
  name: string;
  /** اسم المدرسة أو الجامعة */
  school: string;
  phone: string;
  /** المرحلة: من الابتدائية إلى الجامعة */
  stage?: string;
  college?: string | null;
  instagram?: string | null;
  /** ما قرأته الكاميرا — نصّاً. الصورة لا تصل إلى هنا ولا تُخزَّن */
  idNumber?: string | null;
  idName?: string | null;
  idSchool?: string | null;
  ref?: string | null;
};

export async function registerStudent(
  input: RegisterInput,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  // نفس الفحص الذي على الشاشة، معاداً هنا: الشاشة تُساعد، والخادم يحكم
  const bad = studentFormError({ name: input.name, school: input.school, phone: input.phone, stage: input.stage });
  if (bad) return { ok: false, error: bad };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("register_student", {
    p_name: input.name.trim(),
    p_school: input.school.trim(),
    p_phone: input.phone.trim(),
    p_stage: input.stage?.trim() || "جامعة",
    p_college: input.college?.trim() || null,
    p_instagram: cleanInstagram(input.instagram),
    // البصمة تُحسب على الخادم: رقم البطاقة لا يُخزَّن، والصورة لا تُرسَل أصلاً
    p_id_hash: input.idNumber ? idFingerprint(input.idNumber, input.school) : null,
    p_id_name: input.idName?.trim() || null,
    p_id_school: input.idSchool?.trim() || null,
    p_ref: input.ref?.trim() || null,
  });

  if (error) {
    if (/id already used/i.test(error.message)) {
      return { ok: false, error: "هذه الهوية مسجَّلة سلفاً بحساب آخر." };
    }
    if (/bad phone/i.test(error.message)) return { ok: false, error: "رقم الهاتف غير صحيح." };
    return { ok: false, error: "تعذّر التسجيل — حاول ثانيةً." };
  }
  return { ok: true, token: data as string };
}

export type StudentCard = {
  id: string;
  name_ar: string;
  status: StudentStatus;
  ref_code: string;
  stage: string;
  school: string;
  points: number;
  invited: number;
};

/** بطاقة الطالب من رمزه. الرمز هو الإذن — نفس منطق `/card/[serial]` */
export async function getStudentCard(token: string): Promise<StudentCard | null> {
  const t = token?.trim();
  if (!t) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("student_by_token", { p_token: t });
  const row = Array.isArray(data) ? data[0] : null;
  return (row as StudentCard) ?? null;
}

// ═══ الإدارة ════════════════════════════════════════════════════════════

export type AdminStudent = StudentCard & {
  phone: string;
  college: string | null;
  instagram: string | null;
  id_name: string | null;
  id_school: string | null;
  /** هل قُرئت بطاقته أصلاً — فالمراجع يعرف على أي شيء يحكم */
  scanned: boolean;
  referred_by_name: string | null;
  created_at: string;
};

export async function listStudents(): Promise<AdminStudent[]> {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  const { data, error } = await svc
    .from("students")
    .select("id, name_ar, status, ref_code, stage, school, phone, college, instagram, id_hash, id_name, id_school, referred_by, customer_id, created_at")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(`تعذّر جلب الطلاب: ${error.message}`);
  const rows = data ?? [];

  // النقاط والدعوات والأسماء: ثلاثة أسئلة مجمّعة لا واحدٌ لكل طالب
  const customerIds = rows.map((r) => r.customer_id).filter(Boolean) as string[];
  const { data: cs } = customerIds.length
    ? await svc.from("customers").select("id, points").in("id", customerIds)
    : { data: [] as { id: string; points: number }[] };
  const pointsOf = new Map((cs ?? []).map((c) => [c.id, c.points]));
  const nameOf = new Map(rows.map((r) => [r.id, r.name_ar]));
  const invitedOf = new Map<string, number>();
  for (const r of rows) {
    if (r.referred_by && r.status === "active") invitedOf.set(r.referred_by, (invitedOf.get(r.referred_by) ?? 0) + 1);
  }

  return rows.map((r) => ({
    id: r.id,
    name_ar: r.name_ar,
    status: r.status,
    ref_code: r.ref_code,
    stage: r.stage,
    school: r.school,
    phone: r.phone,
    college: r.college,
    instagram: r.instagram,
    id_name: r.id_name,
    id_school: r.id_school,
    scanned: !!r.id_hash,
    points: r.customer_id ? pointsOf.get(r.customer_id) ?? 0 : 0,
    invited: invitedOf.get(r.id) ?? 0,
    referred_by_name: r.referred_by ? nameOf.get(r.referred_by) ?? null : null,
    created_at: r.created_at,
  }));
}

/**
 * قبول طالبٍ أو رفضه — وهنا تُمنح نقاط من دعاه.
 *
 * عند القبول لا عند التسجيل: لو مُنحت عند التسجيل لصارت الدعوة مزرعة أسماء،
 * يكتب الواحد عشرة أرقام ويقبض عن عشرة.
 *
 * والمنح يمرّ على `loyalty_events` مباشرةً بمفتاحٍ **ثابت**، والفهرس الفريد
 * الجزئي على `idempotency_key` يجعله يقع مرّةً واحدة مهما قُبل الطالب ورُفض
 * وأُعيد قبوله.
 */
export async function setStudentStatus(id: string, status: StudentStatus, note?: string) {
  const staff = await requireAdmin();
  const svc = createSupabaseServiceClient();

  const { data: before } = await svc
    .from("students")
    .select("id, status, referred_by, name_ar")
    .eq("id", id)
    .maybeSingle();
  if (!before) return { ok: false as const, error: "الطالب غير موجود." };

  const { error } = await svc
    .from("students")
    .update({
      status,
      reject_note: status === "rejected" ? note?.trim() || null : null,
      reviewed_by: staff.employeeId,
      activated_at: status === "active" ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };

  if (status === "active" && before.status !== "active" && before.referred_by) {
    await awardReferral(before.referred_by, id).catch(() => {
      /* النقاط مكافأة لا شرط — فشلها لا يمنع قبول الطالب */
    });
  }

  revalidatePath("/students");
  return { ok: true as const };
}

async function awardReferral(referrerStudentId: string, inviteeStudentId: string) {
  const svc = createSupabaseServiceClient();
  const { data: ref } = await svc
    .from("students")
    .select("customer_id")
    .eq("id", referrerStudentId)
    .maybeSingle();
  if (!ref?.customer_id) return;
  await svc.from("loyalty_events").insert({
    customer_id: ref.customer_id,
    delta: REFERRAL_POINTS,
    reason: "referral",
    idempotency_key: referralKey(referrerStudentId, inviteeStudentId),
  });
}

// ── أسعار الطلاب على المنيو ─────────────────────────────────────────────

export type StudentPriceRow = {
  id: string;
  name_ar: string;
  category_name: string;
  price: number;
  student_price: number | null;
  student_only: boolean;
  variants: { id: string; name_ar: string; price: number; student_price: number | null }[];
};

export async function listStudentPricing(): Promise<StudentPriceRow[]> {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  const [{ data: items }, { data: variants }] = await Promise.all([
    svc
      .from("menu_items")
      .select("id, name_ar, price, student_price, student_only, category_id, sort")
      .eq("is_active", true)
      .order("sort"),
    svc.from("item_variants").select("id, item_id, name_ar, price_override, student_price").eq("is_active", true).order("sort"),
  ]);
  const { data: cats } = await svc.from("categories").select("id, name_ar");
  const catName = new Map((cats ?? []).map((c) => [c.id, c.name_ar]));
  const byItem = new Map<string, StudentPriceRow["variants"]>();
  for (const v of variants ?? []) {
    const list = byItem.get(v.item_id) ?? [];
    list.push({ id: v.id, name_ar: v.name_ar, price: v.price_override ?? 0, student_price: v.student_price });
    byItem.set(v.item_id, list);
  }
  return (items ?? []).map((i) => ({
    id: i.id,
    name_ar: i.name_ar,
    category_name: i.category_id ? catName.get(i.category_id) ?? "—" : "—",
    price: i.price,
    student_price: i.student_price,
    student_only: i.student_only,
    variants: (byItem.get(i.id) ?? []).map((v) => ({ ...v, price: v.price || i.price })),
  }));
}

/** سعرٌ فارغ = لا خصم على هذا الحجم. والصفر ليس سعراً — يُقرأ محواً */
const asPrice = (n: number | null | undefined): number | null =>
  n === null || n === undefined || !Number.isFinite(n) || n <= 0 ? null : Math.round(n);

export async function setStudentPrice(input: {
  itemId: string;
  studentPrice?: number | null;
  studentOnly?: boolean;
  variants?: { id: string; studentPrice: number | null }[];
}) {
  await requireAdmin();
  const svc = createSupabaseServiceClient();

  const patch: { student_price?: number | null; student_only?: boolean } = {};
  if (input.studentPrice !== undefined) patch.student_price = asPrice(input.studentPrice);
  if (input.studentOnly !== undefined) patch.student_only = input.studentOnly;
  if (Object.keys(patch).length) {
    const { error } = await svc.from("menu_items").update(patch).eq("id", input.itemId);
    if (error) return { ok: false as const, error: error.message };
  }

  for (const v of input.variants ?? []) {
    const { error } = await svc.from("item_variants").update({ student_price: asPrice(v.studentPrice) }).eq("id", v.id);
    if (error) return { ok: false as const, error: error.message };
  }

  // الخزين ثلاثون ثانية في menu-data.ts، ولا يكفيه revalidatePath وحده
  bustMenuCache();
  for (const p of ["/students", "/menu", "/kiosk", "/cashier"]) revalidatePath(p);
  return { ok: true as const };
}
