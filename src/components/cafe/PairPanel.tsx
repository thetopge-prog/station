"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Smartphone, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { newPairId, pairChannel, pairUrl, parseMessage, type PairMessage } from "@/lib/cafe/pair";

/**
 * لوحة «هاتفك بدل القارئ» على شاشة التجهيز.
 *
 * تعرض رمزاً، فيقرؤه الموظّف بهاتفه، فتقول «متصل ✓» ويبدأ التجهيز. وكل ما
 * يقرؤه الهاتف يصل هنا ويمرّ على `onScan` نفسها التي يمرّ بها القارئ السلكي
 * — فالشاشة هي من يؤكّد، بجلستها وباسم صاحبها.
 *
 * المعرّف يُولَّد هنا في المتصفّح ويموت مع إغلاق اللوحة: لا جدول، ولا ترحيل،
 * ولا رمزٌ يبقى في مكانٍ ما بعد أن ينتهي العطل.
 */

const IDLE_CLOSE_MS = 60 * 60_000;

export function PairPanel({
  onClose,
  onScan,
}: {
  onClose: () => void;
  /** ما قرأه الهاتف — تُرجع سطراً يُعرَض على الهاتف وعلى الشاشة */
  onScan: (code: string) => Promise<{ ok: boolean; text: string }>;
}) {
  // معرّفٌ واحد لعمر اللوحة: يُولَّد مرّة ويموت مع إغلاقها
  const pairId = useMemo(() => newPairId(), []);
  const [qr, setQr] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);
  const [feed, setFeed] = useState<{ ok: boolean; text: string }[]>([]);
  // الخطّاف يُنادى مرّة، والمعالج يقرأ أحدث نسخة من الدالّة عبر المرجع
  const handler = useRef(onScan);
  const close = useRef(onClose);
  useEffect(() => {
    handler.current = onScan;
    close.current = onClose;
  }, [onScan, onClose]);

  useEffect(() => {
    let dead = false;
    void (async () => {
      const QRCode = (await import("qrcode")).default;
      const url = pairUrl(window.location.origin, pairId);
      const data = await QRCode.toDataURL(url, { width: 260, margin: 1 });
      if (!dead) setQr(data);
    })();
    return () => {
      dead = true;
    };
  }, [pairId]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    // قناة بثّ عامّة عمداً: الشاشة تحمل جلسة موظّف والهاتف لا يحمل شيئاً، فلا
    // بدّ أن يلتقيا على قناة يقبلها مفتاح anon. لو فُعِّلت «القنوات الخاصّة»
    // (Realtime Authorization) على المشروع مات هذا الاقتران بصمت
    const ch = supabase.channel(pairChannel(pairId));
    const say = (payload: PairMessage) => void ch.send({ type: "broadcast", event: "msg", payload });

    ch.on("broadcast", { event: "msg" }, ({ payload }) => {
      const m = parseMessage(payload);
      if (!m) return;

      if (m.kind === "hello") {
        // كل «مرحبا» يُرحَّب به، ولا يُحجَز الاقتران لأول هاتف: الهاتف الذي
        // أُعيد تحميل صفحته يرسل «مرحبا» ثانيةً، وحجزُه كان يحبسه خارجاً حتى
        // تُغلق اللوحة وتُفتح. وهاتفان يمسحان معاً لا يضرّان — التذكرة المكرّرة
        // يردّ عليها النظام «جاهز مسبقاً» أصلاً.
        setLinked(true);
        return say({ kind: "welcome", screen: "شاشة التجهيز" });
      }

      if (m.kind === "bye") {
        setLinked(false);
        return;
      }

      if (m.kind === "scan") {
        void handler.current(m.code).then((res) => {
          say({ kind: "ack", ...res });
          setFeed((f) => [res, ...f].slice(0, 6));
        });
      }
    }).subscribe();

    // لا تبقى مفتوحةً إلى الصباح: الرمز على الشاشة دعوةٌ مفتوحة ما دام ظاهراً
    const idle = setTimeout(() => close.current(), IDLE_CLOSE_MS);
    return () => {
      clearTimeout(idle);
      say({ kind: "bye", reason: "closed" });
      void supabase.removeChannel(ch);
    };
  }, [pairId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-sm space-y-3 rounded-2xl bg-card p-5 text-center" onClick={(e) => e.stopPropagation()}>
        <h3 className="flex items-center justify-center gap-2 text-lg font-black">
          <Smartphone className="size-5 text-primary" />
          هاتفك بدل القارئ
        </h3>

        {linked ? (
          <div className="space-y-2">
            <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-primary bg-primary/10 px-4 py-6">
              <CheckCircle2 className="size-12 text-primary" />
              <p className="text-lg font-black text-primary">الجهاز متصل ✓</p>
              <p className="text-sm font-bold text-muted-foreground">امسح التذاكر بهاتفك — النتيجة تظهر هنا وعلى هاتفك.</p>
            </div>
            {feed.length > 0 && (
              <ul className="space-y-1 text-start">
                {feed.map((f, i) => (
                  <li key={i} className={`rounded-lg px-3 py-1.5 text-sm font-black ${f.ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                    {f.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-bold text-muted-foreground">افتح كاميرا هاتفك واقرأ هذا الرمز.</p>
            <div className="flex justify-center">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="" className="size-60 rounded-xl border-2 border-border bg-white p-2" />
              ) : (
                <div className="size-60 animate-pulse rounded-xl bg-muted" />
              )}
            </div>
            <p className="text-xs font-bold text-muted-foreground">سيطلب الهاتف السماح بالكاميرا — اضغط «سماح».</p>
          </div>
        )}

        <button onClick={onClose} className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border-2 border-border px-4 font-bold hover:bg-secondary">
          <X className="size-4" />
          إغلاق
        </button>
      </div>
    </div>
  );
}
