"use client";

import Link from "next/link";
import { Bike, Car, Store, UtensilsCrossed } from "lucide-react";
import { BRAND } from "@/lib/brand";

/**
 * شاشة «من أين تطلب؟» — أول ما يراه الزبون حين يفتح رابط المطعم.
 *
 * ثلاثة أزرار هرمية: «اطلب من البيت هسّة» عريضاً في القمّة لأنه الغالب،
 * وتحته «من المطعم» و«من السيارة» صفّاً واحداً. الهرم ترتيبُ الاحتمالات لا
 * زينة: أكثرها وقوعاً أكبرها وأقربها للإبهام.
 *
 * والخلفية أصناف المطعم نفسها تنساب ببطء — صورة طعام حقيقية تبيع أكثر من أي
 * تدرّج لوني، وخافتة كي تبقى الأزرار مقروءة: الشهية خلف القرار لا فوقه.
 *
 * كل شيء CSS: لا مكتبة حركة ولا مؤقّت جافاسكربت يوقظ الجهاز ولا استدعاء
 * خادم. و«تقليل الحركة» في النظام يوقفها من القاعدة العامّة في globals.css.
 */

export type Shot = { sm: string; full: string };

export function OrderLandingClient({ shots }: { shots: Shot[] }) {
  // شريطان متعاكسان: يبدو المشهد حيّاً لا منزلقاً في اتجاه واحد
  const half = Math.ceil(shots.length / 2);
  const top = shots.slice(0, half);
  const bottom = shots.length > half ? shots.slice(half) : [...top].reverse();

  return (
    <main dir="rtl" className="relative flex min-h-dvh flex-col items-center justify-between overflow-hidden bg-background">
      <Strip items={top} reverse={false} />

      <section className="relative z-10 flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 px-5 py-6">
        {/* الشعار: <img> عادي كما في بقية الشاشات — الصورة مربّعة ٥١٢ ولا تحتاج تحسيناً */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt={BRAND.nameAr}
          width={512}
          height={512}
          className="h-auto w-32 drop-shadow-[0_6px_22px_rgba(255,107,0,0.35)] sm:w-40"
        />
        <p className="-mt-3 text-sm font-bold text-muted-foreground">{BRAND.taglineAr}</p>

        <div className="w-full space-y-3">
          {/* القمّة — الطلب إلى البيت، الأعرض لأنه الأكثر */}
          <Link
            href="/delivery"
            className="flex min-h-28 w-full items-center justify-center gap-4 rounded-3xl bg-primary px-6 text-primary-foreground shadow-lg transition active:scale-[0.98]"
          >
            <Bike className="size-11 shrink-0" strokeWidth={1.75} />
            <span className="text-right">
              <span className="block text-2xl font-black leading-tight">اطلب من البيت هسّة</span>
              <span className="block text-xs font-bold opacity-90">نوصّلك لباب البيت</span>
            </span>
          </Link>

          {/* القاعدة — استلام بنفسك، خياران متساويان */}
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/pickup"
              className="flex min-h-28 flex-col items-center justify-center gap-1.5 rounded-3xl border-2 border-primary bg-card px-3 text-center shadow-md transition active:scale-[0.98]"
            >
              <Store className="size-9 text-primary" strokeWidth={1.75} />
              <span className="text-lg font-black">من المطعم</span>
              <span className="text-[11px] font-bold text-muted-foreground">تستلم من الكاونتر</span>
            </Link>
            <Link
              href="/car"
              className="flex min-h-28 flex-col items-center justify-center gap-1.5 rounded-3xl border-2 border-primary bg-card px-3 text-center shadow-md transition active:scale-[0.98]"
            >
              <Car className="size-9 text-primary" strokeWidth={1.75} />
              <span className="text-lg font-black">من السيارة</span>
              <span className="text-[11px] font-bold text-muted-foreground">نطلعلك للسيارة</span>
            </Link>
          </div>
        </div>

        {/* مؤقّت حتى تختار الإدارة قالباً: الأربعة جنباً إلى جنب، ثم يعود رابط «تصفّح المنيو» واحداً */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground">
            <UtensilsCrossed className="size-4" />
            المنيو
          </span>
          {(["/menunew", "/menunew/2", "/menunew/3", "/menunew/4"] as const).map((href, i) => (
            <Link key={href} href={href} className="grid size-11 place-items-center rounded-full border-2 border-primary font-black text-primary transition active:scale-95">
              {i + 1}
            </Link>
          ))}
        </div>
      </section>

      <Strip items={bottom} reverse faded />
    </main>
  );
}

/**
 * شريط صور ينساب أفقياً.
 *
 * القائمة مكرّرة مرّتين والإزاحة ٥٠٪ بالضبط، فتعود إلى نقطة البداية دون
 * قفزة عند نهاية الدورة — وهي الحيلة الوحيدة هنا.
 *
 * و<img> عادي لا next/image: الصور ‎.webp‎ مضغوطة أصلاً من سكربت الاستيراد،
 * وتمريرها على المُحسِّن يعيد ترميزها بلا فائدة — وهو ما تفعله بقية الشاشات.
 */
function Strip({ items, reverse, faded = false }: { items: Shot[]; reverse: boolean; faded?: boolean }) {
  if (items.length < 2) return null;
  const doubled = [...items, ...items];
  return (
    // dir="ltr" على الشريط وحده: الصفحة عربية، وصفٌّ مرنٌ في RTL يمتدّ يساراً
    // خارج الإطار، فإزاحته يساراً تُفرغ المشهد بدل أن تُدوّره.
    <div aria-hidden dir="ltr" className={`pointer-events-none w-full shrink-0 overflow-hidden ${faded ? "opacity-20" : "opacity-35"}`}>
      <div className={`flex w-max gap-3 ${reverse ? "st-drift-rev" : "st-drift"}`}>
        {doubled.map((s, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${s.sm}-${i}`}
            src={s.sm}
            data-full={s.full}
            alt=""
            loading="lazy"
            onError={(e) => {
              const img = e.currentTarget;
              const full = img.dataset.full;
              // الصغيرة غير موجودة؟ جرّب الكاملة. وإن غابت الاثنتان فلا فراغ يُترك
              if (full && img.src !== full) img.src = full;
              else img.style.display = "none";
            }}
            className="size-24 shrink-0 rounded-2xl object-cover sm:size-32"
          />
        ))}
      </div>
    </div>
  );
}
