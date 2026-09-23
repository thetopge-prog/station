"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Link2Off, Smartphone, XCircle } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cameraBlockedReason, pairChannel, parseMessage, shouldSend, type PairMessage } from "@/lib/cafe/pair";
import { QrScanner } from "./QrScanner";

/**
 * هاتف الموظّف بعد أن يقرأ رمز الاقتران — كاميرا وحسب.
 *
 * لا يسجّل دخولاً، ولا ينادي الخادم، ولا يعرف شيئاً عن الطلبات: يبثّ ما قرأ
 * إلى شاشة التجهيز، والشاشة تؤكّد بجلستها هي. فلو ضاع الهاتف أو صُوّر الرمز
 * فأقصى ما يُفعَل تعليمُ طلبٍ «جاهز» قبل أوانه.
 *
 * والردّ يعود إلى الهاتف («٩٠٨ → جاهز ✓»): الموظّف يقف عند رفّ التجهيز لا
 * أمام الشاشة، فلو لم يرَ النتيجة في يده لمسح التذكرة مرّتين.
 */

/** ثلاث ثوانٍ: أطول من أي ردّ صحيح، وأقصر من أن يمضي الموظّف بالكيس */
const ACK_MS = 3000;

type Link = "connecting" | "linked" | "lost" | "taken";

export function PhoneScanner({ pairId }: { pairId: string }) {
  const [link, setLink] = useState<Link>("connecting");
  const [last, setLast] = useState<{ ok: boolean; text: string } | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const chan = useRef<ReturnType<ReturnType<typeof createSupabaseBrowserClient>["channel"]> | null>(null);
  // آخر ما بُثّ — لكبح التذكرة الباقية أمام العدسة
  const sent = useRef<{ code: string; at: number } | null>(null);
  // مهلة انتظار الردّ: البثّ بلا ضمان تسليم، فلو انقطع الخطّ لحظةَ المسح ضاعت
  // القراءة بصمت — والموظّف يمضي بالكيس ظانّاً أن الطلب صار «جاهز»
  const waiting = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // قراءة العنوان بعد الترطيب لا في مُهيّئ الحالة: الخادم لا يعرف بأي
    // بروتوكول فُتحت الصفحة، فقيمةٌ مبدئية منه تخالف ما يراه المتصفّح
    // eslint-disable-next-line react-hooks/set-state-in-effect -- قراءة واحدة لعنوان الصفحة عند التحميل
    setBlocked(cameraBlockedReason(window.location.protocol, window.location.hostname));
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const ch = supabase.channel(pairChannel(pairId));
    chan.current = ch;
    ch.on("broadcast", { event: "msg" }, ({ payload }) => {
      const m: PairMessage | null = parseMessage(payload);
      if (!m) return;
      if (m.kind === "welcome") setLink("linked");
      if (m.kind === "ack") {
        if (waiting.current) clearTimeout(waiting.current);
        waiting.current = null;
        setLast({ ok: m.ok, text: m.text });
        navigator.vibrate?.(m.ok ? 40 : [80, 60, 80]);
      }
      if (m.kind === "bye") setLink(m.reason === "taken" ? "taken" : "lost");
    }).subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      // «أنا هنا» — الشاشة تردّ welcome فينتقل الهاتف إلى «متصل»
      void ch.send({ type: "broadcast", event: "msg", payload: { kind: "hello" } });
    });
    return () => {
      if (waiting.current) clearTimeout(waiting.current);
      void ch.send({ type: "broadcast", event: "msg", payload: { kind: "bye", reason: "closed" } });
      void supabase.removeChannel(ch);
      chan.current = null;
    };
  }, [pairId]);

  const onScan = useCallback((code: string) => {
    const now = Date.now();
    if (!shouldSend(code, sent.current, now)) return;
    sent.current = { code, at: now };
    // اهتزازة قصيرة: الموظّف يسمع ضجيج المطبخ ولا يسمع صفّارة
    navigator.vibrate?.(60);
    setLast(null);
    void chan.current?.send({ type: "broadcast", event: "msg", payload: { kind: "scan", code, at: now } });
    if (waiting.current) clearTimeout(waiting.current);
    waiting.current = setTimeout(() => {
      waiting.current = null;
      setLast({ ok: false, text: "لم يصل الردّ — تأكّد من الإنترنت وأعد المسح" });
      navigator.vibrate?.([80, 60, 80]);
    }, ACK_MS);
  }, []);

  if (blocked) {
    return (
      <Shell>
        <p className="rounded-2xl border-2 border-destructive bg-destructive/10 px-4 py-3 text-center font-bold text-destructive">{blocked}</p>
      </Shell>
    );
  }

  if (link === "taken" || link === "lost") {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 text-center">
          <Link2Off className="size-12 text-destructive" />
          <p className="text-lg font-black">{link === "taken" ? "الشاشة مقترنة بهاتف آخر" : "انقطع الاتصال بالشاشة"}</p>
          <p className="text-sm font-bold text-muted-foreground">افتح شاشة التجهيز واقرأ الرمز من جديد.</p>
        </div>
      </Shell>
    );
  }

  return (
    <main dir="rtl" className="min-h-dvh bg-background">
      <header className="flex items-center justify-between gap-2 border-b-2 border-border px-4 py-3">
        <span className="flex items-center gap-2 font-black">
          <Smartphone className="size-5 text-primary" />
          هاتفك قارئ التذاكر
        </span>
        <span
          className={`rounded-full px-3 py-1 text-xs font-black ${
            link === "linked" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {link === "linked" ? "● متصل بالشاشة" : "○ يتصل…"}
        </span>
      </header>

      {/* بلا زرّ إغلاق: هذه الصفحة كلّها كاميرا، وإغلاقها إغلاق اللسان */}
      <QrScanner continuous title="امسح تذكرة التجهيز" onScan={onScan} onClose={() => undefined} />

      {last && (
        <div
          className={`fixed inset-x-0 bottom-0 z-[60] px-4 py-4 text-center text-lg font-black ${
            last.ok ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground"
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            {last.ok ? <CheckCircle2 className="size-6" /> : <XCircle className="size-6" />}
            {last.text}
          </span>
        </div>
      )}
    </main>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main dir="rtl" className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-4">{children}</div>
    </main>
  );
}
