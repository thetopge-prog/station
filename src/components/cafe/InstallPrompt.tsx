"use client";

import { useEffect, useState } from "react";
import { Share, SquarePlus, X } from "lucide-react";
import { BRAND } from "@/lib/brand";

/**
 * «ثبّت المنيو على شاشتك» — يُعرض مرّةً واحدة، وبعد أن يكون الزبون قد تصفّح.
 *
 * رابط المنيو يصل في واتساب، فيُفتح ويُنسى ويُطلب الرابط مرّةً أخرى في المرّة
 * القادمة. والتثبيت يجعله أيقونةً على الشاشة: يُفتح بضغطة، ويعمل على شبكةٍ
 * ضعيفة لأن عامل الخدمة يخزّن الصور (وهي أكثر ما في المنيو).
 *
 * وطريقان لا واحد:
 * - أندرويد/كروم يطلق `beforeinstallprompt`، فيُحتجَز ويُطلق حين يضغط الزبون
 *   زرّنا نحن. والمتصفّح لا يقبل النداء إلّا من ضغطةٍ حقيقية.
 * - آيفون لا يطلق شيئاً أصلاً، والتثبيت فيه يدوي — فتُشرح الخطوتان بصورتيهما.
 *
 * ولا يظهر إن كان مثبّتاً أصلاً، ولا لمن أغلقه من قبل — والعلامة واحدة في
 * الصفحتين، فمن رآه على شاشة الاستلام لا يراه ثانيةً في المنيو.
 *
 * والتأخير يختلف بينهما: لافتةٌ تقفز في وجه من فتح الصفحة للتوّ تُغلَق بلا
 * قراءة، لكن شاشة الاستلام ثلاثة أزرارٍ يُضغط أحدها في ثوانٍ — فثماني ثوانٍ
 * هناك تعني ألّا تُرى أصلاً.
 */
const SEEN = "st-install-v1";

type Installable = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallPrompt({ delayMs = 8_000 }: { delayMs?: number }) {
  const [how, setHow] = useState<"android" | "ios" | null>(null);
  const [deferred, setDeferred] = useState<Installable | null>(null);

  useEffect(() => {
    // مثبَّتٌ أصلاً — لا شيء يُعرض. و`standalone` على آيفون خاصّيةٌ غير قياسية
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;
    try {
      if (localStorage.getItem(SEEN)) return;
    } catch {
      /* وضع التصفّح الخاص يرفض التخزين — تُعرض اللافتة، وهذا مقبول */
    }

    const onPrompt = (e: Event) => {
      // بلا هذا يعرض كروم لافتته الصغيرة ويبتلع الحدث، فلا يبقى لنا ما نطلقه
      e.preventDefault();
      setDeferred(e as Installable);
      setTimeout(() => setHow("android"), delayMs);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // آيفون: لا حدث ولا واجهة برمجية — يُكتشف بالمتصفّح نفسه وتُشرح الخطوات.
    // و«سفاري» شرطٌ لازم: كروم على آيفون لا يملك «أضف إلى الشاشة الرئيسية»
    const ua = navigator.userAgent;
    const iosSafari = /iPad|iPhone|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    const t = iosSafari ? setTimeout(() => setHow("ios"), delayMs) : null;

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      if (t) clearTimeout(t);
    };
  }, [delayMs]);

  if (!how) return null;

  const close = () => {
    setHow(null);
    try {
      localStorage.setItem(SEEN, "1");
    } catch {
      /* لا يهمّ: اللافتة ستظهر مرّةً أخرى، لا أكثر */
    }
  };

  const install = async () => {
    if (!deferred) return close();
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* أغلق الزبون نافذة المتصفّح — لا شيء يُفعل */
    }
    close();
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-md items-start gap-3 rounded-2xl border-2 border-primary bg-card p-3 shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="size-12 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-base font-black">خلّي منيو {BRAND.nameAr} على شاشتك</p>
          {how === "android" ? (
            <>
              <p className="mt-0.5 text-sm font-bold text-muted-foreground">
                تفتحه بضغطة وتطلب أسرع — وبدون ما تدوّر على الرابط كل مرّة.
              </p>
              <button
                onClick={() => void install()}
                className="mt-2 min-h-11 w-full rounded-xl bg-primary font-black text-primary-foreground"
              >
                ثبّته الآن
              </button>
            </>
          ) : (
            <p className="mt-1 flex flex-wrap items-center gap-1 text-sm font-bold text-muted-foreground">
              دوس
              <Share className="inline size-4 text-primary" aria-label="مشاركة" />
              <span className="font-black text-foreground">مشاركة</span>
              ثم
              <SquarePlus className="inline size-4 text-primary" aria-label="إضافة" />
              <span className="font-black text-foreground">إضافة إلى الشاشة الرئيسية</span>
            </p>
          )}
        </div>
        <button onClick={close} aria-label="إغلاق" className="-m-1 shrink-0 p-1 text-muted-foreground">
          <X className="size-5" />
        </button>
      </div>
    </div>
  );
}
