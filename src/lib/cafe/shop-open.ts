import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { cachedRef } from "./ttl-cache";
import { hubEnabled } from "@/lib/hub/store";
import { cloudReachable } from "@/lib/hub/net";

/**
 * المطعم مفتوح = صندوق مفتوح.
 *
 * المالك: «اربط المنيو بلحظة بدء الوردية ويغلق بانتهائها». الوردية المالية واحدة
 * على مستوى المحل (0063)، فوجودها هو الفتح وغيابها هو الإغلاق — بلا جدول
 * أوقات يُنسى تحديثه في العيد. ثلاثون ثانية تخزين: يُغلق الصندوق فيُغلق المنيو
 * قبل أن ينتهي الزبون من قراءة الأصناف.
 *
 * الهَب بلا خط يُعدّ مفتوحاً: انقطاع الإنترنت ليس إغلاق المطعم.
 */
export async function isShopOpen(): Promise<boolean> {
  if (hubEnabled() && !(await cloudReachable())) return true;
  try {
    // cachedRef never caches an empty/false answer, so «closed» is re-asked each time — fine, it is one indexed row
    return await cachedRef("shop-open", 30_000, async () => {
      const svc = createSupabaseServiceClient();
      const { data } = await svc.from("cashier_sessions").select("id").is("closed_at", null).limit(1);
      return !!data?.length;
    });
  } catch {
    return true;
  }
}
