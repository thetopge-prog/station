"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BellOff, BellRing, Check, ChefHat, Clock, Share, Smartphone, VolumeX } from "lucide-react";
import { chimeReady } from "@/lib/cafe/chime";
import { getMyOrders } from "@/lib/cafe/order-actions";
import { subscribeToPager } from "@/lib/cafe/pager-actions";

/**
 * البيجر — «طلبك جاهز» على هاتف الزبون.
 *
 * ══ لماذا زرٌّ واحد يفعل شيئين ══
 *
 * الصوت لا يُشغَّل في المتصفّح بلا لمسةٍ من المستخدم، وإذن الإشعارات لا يُطلب
 * بلا لمسة. فلمسةٌ واحدة تفتح الاثنين — ولو تُركا لتلقائيّة الصفحة لَما عمل
 * أيٌّ منهما، وظنّ الزبون أن البيجر يعمل وهو صامت.
 *
 * ══ ولماذا استطلاع لا زمنٌ حيّ ══
 *
 * `orders` عليه RLS بلا سياسةٍ لزائرٍ بلا حساب، فقناة الزمن الحيّ **تشترك
 * ولا يصلها شيء أبداً** — فخٌّ موثَّق في الترحيل 0059. فاستطلاعٌ كل عشر ثوانٍ،
 * ويتباطأ إلى ستّين حين تُخفى الصفحة: هاتفٌ في الجيب لا يحتاج عشر ثوانٍ،
 * والإشعار هو من يوقظه لا الاستطلاع.
 *
 * ══ وآيفون ══
 *
 * لا يستقبل إشعار ويب إلا من موقعٍ مضافٍ إلى الشاشة الرئيسية. فتُقال الحقيقة
 * كما هي: ما دامت الصفحة مفتوحة ننبّهك، ولتخرج من الصفحة أضِفها أولاً. ولا
 * يُوعَد بما لا يقع.
 */

const POLL_OPEN = 10_000;
const POLL_HIDDEN = 60_000;

type Phase = "preparing" | "ready" | "handed" | "cancelled";

export function PagerClient({
  orderId,
  orderSeq,
  pickupCode,
  createdAt,
  initialPhase,
  pushKey,
}: {
  orderId: string;
  orderSeq: string;
  pickupCode: string | null;
  createdAt: string;
  initialPhase: Phase;
  pushKey: string | null;
}) {
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [armed, setArmed] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [needsInstall, setNeedsInstall] = useState(false);
  const rang = useRef(false);
  const [mins, setMins] = useState(0);
  const [ringing, setRinging] = useState(false);

  /**
   * الرنين — **متكرّرٌ حتى يُسكته الزبون**، لا رنّةً واحدة.
   *
   * هذا ما يستبدل جهاز البيجر فعلاً. الجهاز يهتزّ ويرنّ حتى تضغط زرّه، ورنّةٌ
   * واحدة مدّتها نصف ثانية تضيع في ضجّة مطعمٍ ليلاً — فيبقى الزبون قاعداً
   * وطلبُه يبرد على الرفّ.
   *
   * فيُعاد كل ثلاث ثوانٍ حتى دقيقة كاملة، أو حتى يضغط «استلمت».
   */
  const ring = useCallback(() => {
    if (rang.current) return;
    rang.current = true;
    setRinging(true);
  }, []);

  // نبضة الإنذار: صوتٌ واهتزاز معاً، وتتوقّف بالضغط أو بعد دقيقة
  useEffect(() => {
    if (!ringing) return;
    let beats = 0;
    const beat = () => {
      try {
        chimeReady();
      } catch {
        /* الصوت مكتوم أو مرفوض — الاهتزاز والشاشة يبقيان */
      }
      try {
        navigator.vibrate?.([400, 150, 400]);
      } catch {
        /* لا اهتزاز على هذا الجهاز */
      }
      // دقيقةٌ تكفي: إنذارٌ لا ينتهي يصير إزعاجاً يُغلَق التطبيق بسببه
      if (++beats >= 20) setRinging(false);
    };
    beat();
    const id = setInterval(beat, 3000);
    return () => clearInterval(id);
  }, [ringing]);

  /*
   * عدّاد الانتظار.
   *
   * صفحةٌ ساكنة خمس عشرة دقيقة تبدو معطّلة، فيقفلها الزبون ويقف عند الكاونتر
   * — وهو ما بُني البيجر ليمنعه. ورقمٌ يكبر كل دقيقة يقول «أنا شغّالة» بلا
   * كلام. و`Date.now()` في أثرٍ لا في الرندر: React 19 يرفض النداء غير الصافي.
   */
  useEffect(() => {
    const tick = () => setMins(Math.max(0, Math.floor((Date.now() - Date.parse(createdAt)) / 60_000)));
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [createdAt]);

  /*
   * إبقاء الشاشة موقدة — وهذه ليست رفاهية، هي ما يجعل الوعد صادقاً.
   *
   * «ننبّهك ما دامت الصفحة مفتوحة» ينكسر بعد ثلاثين ثانية: الهاتف يُطفئ شاشته،
   * فتُعلَّق الصفحة، فلا صفّارة ولا اهتزاز. وهذا هو مسار الآيفون الأساسي عندنا
   * — فلولا هذا القفل لكان وعداً لا يُوفى.
   *
   * ولا يُطلب إلا بعد لمسة «نبّهني»: المتصفّحات ترفضه بلا تفاعل، وهي اللمسة
   * نفسها التي تفتح الصوت. ونفس نمط `use-display-watchdog` لشاشات المحل.
   */
  useEffect(() => {
    if (!armed || phase !== "preparing") return;
    type WakeLock = { release: () => Promise<void> };
    let lock: WakeLock | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLock> } };
    const acquire = async () => {
      try {
        lock = (await nav.wakeLock?.request("screen")) ?? null;
      } catch {
        /* مرفوض أو غير مدعوم — الإشعار يبقى، وخطة الطاقة تتكفّل */
      }
    };
    void acquire();
    // القفل يسقط كلّما أُخفيت الصفحة — يُستعاد عند العودة
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, [armed, phase]);

  // الاستطلاع: يتباطأ حين تُخفى الصفحة، ويتوقّف حين ينتهي الطلب
  useEffect(() => {
    if (phase === "ready" || phase === "handed" || phase === "cancelled") return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const [o] = await getMyOrders([orderId]);
        if (!stop && o) {
          if (o.status === "cancelled") setPhase("cancelled");
          else if (o.prep_status === "ready") setPhase("ready");
          else if (o.prep_status === "handed") setPhase("handed");
        }
      } catch {
        /* عثرة شبكة — المحاولة القادمة تكفي */
      }
      if (!stop) timer = setTimeout(tick, document.hidden ? POLL_HIDDEN : POLL_OPEN);
    };
    timer = setTimeout(tick, POLL_OPEN);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [orderId, phase]);

  // صار جاهزاً وقد سلّحه الزبون: رنّ
  useEffect(() => {
    if (phase === "ready" && armed) ring();
  }, [phase, armed, ring]);

  async function arm() {
    setNote(null);
    // ١) اللمسة تفتح الصوت — تُشغَّل نغمةٌ صامتة الآن كي يُسمح بها لاحقاً
    setArmed(true);
    // نغمةٌ الآن، باللمسة نفسها: هي ما يفتح الصوت للمتصفّح، فتُسمع النغمة
    // الحقيقية لاحقاً حين يجهز الطلب. وبلا هذه تُكتَم تلك
    try {
      chimeReady();
    } catch {
      /* الصوت مرفوض على هذا الجهاز — الاهتزاز والشاشة يبقيان */
    }

    // ٢) وتطلب الإشعار إن كان ممكناً على هذا الجهاز
    if (!pushKey || typeof Notification === "undefined" || !("serviceWorker" in navigator)) {
      setNote("راح ننبّهك ما دامت الصفحة مفتوحة.");
      return;
    }
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    // آيفون من تبويب سفاري لا يشترك أبداً — ولا يُطلب إذنٌ لن ينفع
    if (isIOS && !standalone) {
      setNeedsInstall(true);
      setNote("راح ننبّهك ما دامت الصفحة مفتوحة.");
      return;
    }

    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setNote("ما سمحت بالإشعارات — راح ننبّهك ما دامت الصفحة مفتوحة.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(pushKey),
      });
      const j = sub.toJSON();
      if (!j.keys?.p256dh || !j.keys?.auth) return;
      const r = await subscribeToPager(orderId, { endpoint: sub.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } });
      if (r.ok) {
        setPushOn(true);
        setNote(null);
      } else setNote(r.error);
    } catch {
      setNote("ما قدرنا نفعّل الإشعار — بس راح ننبّهك والصفحة مفتوحة.");
    }
  }

  if (phase === "cancelled") {
    return (
      <Shell>
        <p className="text-2xl font-black text-destructive">أُلغي الطلب</p>
        <p className="text-sm font-bold text-muted-foreground">راجعنا إذا كان بالغلط.</p>
      </Shell>
    );
  }

  const ready = phase === "ready" || phase === "handed";

  return (
    <Shell tone={ready ? "ready" : "wait"}>
      <p className="text-sm font-black text-muted-foreground">رقم طلبك</p>
      <p className="text-7xl font-black leading-none tracking-tight text-primary">{orderSeq}</p>
      {pickupCode && (
        <p className="mt-1 rounded-xl border-2 border-dashed border-border px-4 py-1.5 text-lg font-black tracking-widest">
          {pickupCode}
        </p>
      )}

      {ready ? (
        <>
          <p className="mt-5 flex items-center gap-2 text-3xl font-black text-emerald-600">
            <Check className="size-8" />
            جاهز!
          </p>
          <p className="text-base font-bold">تفضّل استلمه من الكاونتر</p>
          {/* زرّ البيجر نفسه: يسكت الرنين حين يراه الزبون */}
          {ringing && (
            <button
              onClick={() => setRinging(false)}
              className="mt-5 flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-6 text-xl font-black text-white shadow-lg transition active:scale-[0.98]"
            >
              <BellOff className="size-6" />
              شفته — وقّف التنبيه
            </button>
          )}
        </>
      ) : (
        <>
          <p className="mt-5 flex items-center gap-2 text-xl font-black">
            <ChefHat className="size-6 text-primary" />
            قيد التجهيز
          </p>
          <p className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground">
            <Clock className="size-4" />
            {mins < 1 ? "توّه انطلب" : `صار له ${mins} دقيقة`}
          </p>

          {/* نبضةٌ تقول إن الصفحة حيّة تراقب — وصفحةٌ ساكنة تبدو معطّلة */}
          <div className="mt-4 flex items-center gap-2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="size-2.5 animate-pulse rounded-full bg-primary"
                style={{ animationDelay: `${i * 0.35}s`, animationDuration: "1.6s" }}
              />
            ))}
          </div>

          {!armed ? (
            <button
              onClick={() => void arm()}
              className="mt-5 flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-xl font-black text-primary-foreground shadow-lg transition active:scale-[0.98]"
            >
              <BellRing className="size-6" />
              نبّهني لمّا يجهز
            </button>
          ) : (
            <div className="mt-5 w-full rounded-2xl bg-secondary px-4 py-3">
              <p className="flex items-center justify-center gap-1.5 text-base font-black text-primary">
                <Check className="size-5" />
                {pushOn ? "التنبيه شغّال — تكدر تقفل الهاتف" : "التنبيه شغّال"}
              </p>
              {/* الفرق بين الحالتين يُقال صراحةً: من بقي على الصفحة يجب أن
                  يعرف أنها يجب أن تبقى مفتوحة، ولا يُترك يظنّ غير ذلك */}
              <p className="mt-1 text-center text-xs font-bold text-muted-foreground">
                {pushOn
                  ? "يوصلك إشعار حتى لو سكّرت الصفحة"
                  : "خلّي هذه الصفحة مفتوحة — الشاشة راح تبقى شغّالة وتصفّر لمّا يجهز"}
              </p>
              {/*
                الوضع الصامت يكتم كل شيء — وهذا الفرق بينه وبين جهاز البيجر،
                فيُقال قبل أن ينتظر لا بعد أن يفوته طلبه
              */}
              <p className="mt-2 flex items-center justify-center gap-1.5 rounded-xl bg-card px-2 py-1.5 text-[11px] font-black">
                <VolumeX className="size-3.5 shrink-0 text-primary" />
                تأكّد أن جوالك مو على الصامت
              </p>
            </div>
          )}

          {note && <p className="mt-2 text-sm font-bold text-muted-foreground">{note}</p>}

          {needsInstall && (
            <div className="mt-3 rounded-2xl border-2 border-border bg-card p-3 text-right">
              <p className="flex items-center gap-1.5 text-sm font-black">
                <Smartphone className="size-4 text-primary" />
                تريد ينبّهك وإنت خارج الصفحة؟
              </p>
              <p className="mt-1 text-xs font-bold leading-relaxed text-muted-foreground">
                الآيفون ما يرسل إشعارات إلا للمواقع المضافة للشاشة الرئيسية. اضغط
                <Share className="mx-1 inline size-3.5" />
                <b>مشاركة</b> ← <b>إضافة إلى الشاشة الرئيسية</b>، وافتح الرابط من هناك.
              </p>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}

function Shell({ children, tone = "wait" }: { children: React.ReactNode; tone?: "wait" | "ready" }) {
  return (
    <main
      dir="rtl"
      className={`flex min-h-dvh flex-col items-center justify-center p-6 text-center transition-colors ${
        tone === "ready" ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-background"
      }`}
    >
      {children}
    </main>
  );
}

/** مفتاح VAPID يصل نصّاً ويُطلب مصفوفةَ بايتات — نفس المحوّل في StaffShell */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
