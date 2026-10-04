import type { Metadata } from "next";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { couponLabel, type CouponKind } from "@/lib/cafe/coupon";
import { BRAND } from "@/lib/brand";

/**
 * صفحة الكوبون للزبون — يحفظها في هاتفه كما يحفظ بطاقة الولاء.
 *
 * عامّة بلا حساب على نمط `/card/[serial]`: الرمز نفسه هو ما يُعرَض، فلا
 * تكشف الصفحة شيئاً لا يملكه حاملها أصلاً. ولا تُعرض فيها بيانات الزبون —
 * لا اسم ولا هاتف — فمن وصله الرابط بالخطأ لا يعرف لمن هو.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "كوبون — مطعم المحطة", robots: { index: false } };

export default async function CouponPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const clean = (code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const svc = createSupabaseServiceClient();
  const { data: c } = await svc
    .from("coupons")
    .select("code, kind, value, item_id, max_uses, used_count, min_order, expires_on, is_active")
    .eq("code", clean)
    .maybeSingle();

  let itemName: string | null = null;
  if (c?.item_id) {
    const { data: it } = await svc.from("menu_items").select("name_ar").eq("id", c.item_id).maybeSingle();
    itemName = it?.name_ar ?? null;
  }

  const today = new Date().toISOString().slice(0, 10);
  const dead =
    !c || !c.is_active || c.used_count >= c.max_uses || (c.expires_on != null && c.expires_on < today);
  const left = c ? c.max_uses - c.used_count : 0;

  return (
    <main dir="rtl" className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-lg font-black text-primary">{BRAND.nameAr}</p>

      {!c ? (
        <p className="text-base font-bold text-muted-foreground">ما لكينا هذا الرمز.</p>
      ) : (
        <div className={`w-full rounded-3xl border-2 p-6 ${dead ? "border-border opacity-60" : "border-primary"}`}>
          <p className="text-sm font-bold text-muted-foreground">كوبون خصم</p>
          <p className="mt-2 text-2xl font-black">{couponLabel({ kind: c.kind as CouponKind, value: c.value }, itemName)}</p>
          <p className="my-4 text-4xl font-black tracking-[0.25em] tabular-nums" dir="ltr">{c.code}</p>

          {dead ? (
            <p className="text-sm font-black text-destructive">
              {!c.is_active ? "هذا الكوبون موقوف." : c.used_count >= c.max_uses ? "استُعمل خلص." : "انتهت صلاحيته."}
            </p>
          ) : (
            <div className="space-y-1 text-sm font-bold text-muted-foreground">
              {c.min_order ? <p>على طلب {c.min_order.toLocaleString("en-US")} د.ع فما فوق</p> : null}
              {c.expires_on ? <p>صالح لغاية {c.expires_on}</p> : null}
              {left > 1 ? <p>يصلح {left} مرّات بعد</p> : null}
              <p className="pt-2 text-foreground">اذكر الرمز عند الطلب ويتخصّم عنك 😋</p>
            </div>
          )}
        </div>
      )}

      <p className="text-xs font-bold text-muted-foreground">{BRAND.addressAr}</p>
    </main>
  );
}
