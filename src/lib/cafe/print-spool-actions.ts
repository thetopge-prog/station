"use server";

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "./auth";

/**
 * طابور الطباعة — الطابعة تتبع الطلب لا الجهاز.
 *
 * طلب مدفوع بلا «طُبع في» ينتظر أول جهاز يراه وعنده وكيل طباعة. الادّعاء
 * تحديث شرطه printed_at is null: يفوز به جهاز واحد، ولو فُتح الكاشير في
 * تبويبين. ومن أخفق في الطباعة بعد الادّعاء يُطلقه ليُلتقط ثانيةً.
 */

/** مدفوع منذ ١٥ ثانية على الأقل (الجهاز الذي أدخله يطبع فوراً ويعلّم) وخلال ساعتين (ورقة قديمة ضجيج) */
export async function listUnprinted(): Promise<{ id: string; order_seq: number }[]> {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  const now = Date.now();
  const { data } = await svc
    .from("orders")
    .select("id, order_seq")
    .eq("status", "paid")
    .is("printed_at", null)
    .gte("paid_at", new Date(now - 2 * 3_600_000).toISOString())
    .lte("paid_at", new Date(now - 15_000).toISOString())
    .order("paid_at", { ascending: true })
    .limit(10);
  return data ?? [];
}

/** يعود true لمن فاز بالطلب؛ الآخرون يرون false ويمضون */
export async function claimPrint(orderId: string): Promise<boolean> {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  const { data } = await svc.from("orders").update({ printed_at: new Date().toISOString() }).eq("id", orderId).is("printed_at", null).select("id");
  return (data?.length ?? 0) > 0;
}

/** الطباعة أخفقت بعد الادّعاء — يعود الطلب إلى الطابور */
export async function releasePrint(orderId: string): Promise<void> {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  await svc.from("orders").update({ printed_at: null }).eq("id", orderId);
}
