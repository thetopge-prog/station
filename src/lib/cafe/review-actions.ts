"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "./auth";
import { reviewDue, reviewMessage } from "./review-ask";
import { customerNameFrom } from "./wa-name";

/**
 * قائمة «رسائل التقييم» — ما حان وقت إرساله بيد موظّف.
 *
 * زبون البوت تصله الرسالة وحدها (`/api/bot/followups`). أما زبون الكاشير فلم
 * يراسلنا على واتساب قطّ، **وميتا تمنع إرسال رسالةٍ حرّة لمن لم يراسلنا خلال
 * ٢٤ ساعة** — لا قالب معتمداً في النظام ولا تتبّع لتلك النافذة. فالإرسال يدوي:
 * يضغط الموظّف زرّاً يفتح واتساب والرسالة مكتوبة كاملةً، ويضغط «إرسال».
 *
 * وهو نفس نمط `ExpediterClient.notifyCustomer` القائم — رابط `wa.me` يفتحه
 * الموظّف بيده.
 */

export type ReviewDue = {
  id: string;
  orderSeq: number;
  name: string | null;
  phone: string;
  focus: string | null;
  /** منذ كم دقيقة سُلّم — يُحسب في الخادم: الصفحة ديناميكية، ولا داعي لساعةٍ في المتصفّح */
  waitedMin: number;
  /** النصّ جاهزاً — يُبنى في الخادم فلا يختلف بين شاشةٍ وأخرى */
  message: string;
};

export async function listReviewDue(): Promise<ReviewDue[]> {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  const { data } = await svc
    .from("orders")
    .select("id, order_seq, customer_name, customer_phone, review_focus, handed_at, channel, whatsapp_wa_id")
    .eq("ask_review", true)
    .is("review_asked_at", null)
    .not("handed_at", "is", null)
    .not("customer_phone", "is", null)
    // زبون البوت يُرسَل له تلقائياً — لا يُعرض على أحد
    .is("whatsapp_wa_id", null)
    .neq("status", "cancelled")
    .order("handed_at", { ascending: true })
    .limit(40);

  return (data ?? [])
    .filter((o) => reviewDue(o.handed_at, o.channel))
    .map((o) => ({
      id: o.id,
      orderSeq: o.order_seq,
      name: o.customer_name,
      phone: o.customer_phone as string,
      focus: o.review_focus,
      waitedMin: Math.max(0, Math.round((Date.now() - Date.parse(o.handed_at as string)) / 60_000)),
      message: reviewMessage({ name: customerNameFrom(o.customer_name), focus: o.review_focus }),
    }));
}

/** أُرسلت — تُختم فتخرج من القائمة ولا تُرسَل مرّتين */
export async function markReviewAsked(orderId: string): Promise<{ ok: boolean }> {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  const { error } = await svc
    .from("orders")
    .update({ review_asked_at: new Date().toISOString() })
    .eq("id", orderId);
  revalidatePath("/reviews");
  return { ok: !error };
}

/** عدد المنتظِر — للشارة في القائمة، فلا يُفتح الباب ليُرى أنه فارغ */
export async function reviewDueCount(): Promise<number> {
  try {
    return (await listReviewDue()).length;
  } catch {
    return 0;
  }
}
