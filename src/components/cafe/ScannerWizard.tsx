"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Cable, CheckCircle2, ScanLine, Usb, Volume2, VolumeX } from "lucide-react";
import { charFromKey, parseScan } from "./use-barcode-scanner";

/**
 * معالج فحص القارئ — يقرأ ما يصل من القارئ حرفاً حرفاً ويشخّص.
 *
 * الحالات التي تحدث فعلاً (كلها وقعت في المحل):
 *   · لا يصل شيء ويصفّر → مقترن بلا بروفايل «لوحة مفاتيح» (البلوتوث BLE)
 *   · لا يصل شيء ولا يصفّر → لا يقرأ QR أصلاً (وضع QR مطفأ، أو مسافة/إضاءة)
 *   · يصل الرمز بلا Enter → لاحقة CR غير مفعّلة
 *   · فجوات أطول من 150ms بين الحروف → بلوتوث بطيء، الرمز يتقطّع
 *   · حروف عربية بدل الإنجليزية → لغة لوحة المفاتيح (يتحمّلها النظام، لكن تُصلَح)
 */
type Step = "connect" | "scan" | "diagnose" | "ticket" | "done";
type Capture = { text: string; gaps: number[]; enter: boolean; keys: { key: string; code: string }[] };

const GAP_LIMIT = 150;

export function ScannerWizard({ testCode, testQr, ticketCode, ticketQr }: { testCode: string; testQr: string; ticketCode: string; ticketQr: string }) {
  const [step, setStep] = useState<Step>("connect");
  const [conn, setConn] = useState<"usb" | "dongle" | "bt">("usb");
  const [cap, setCap] = useState<Capture | null>(null);
  const [beeped, setBeeped] = useState<boolean | null>(null);
  const [focused, setFocused] = useState(false);
  const zone = useRef<HTMLDivElement>(null);
  const buf = useRef<Capture>({ text: "", gaps: [], enter: false, keys: [] });
  const last = useRef(0);
  const timer = useRef<number | null>(null);

  const listening = step === "scan" || step === "ticket";

  useEffect(() => {
    if (!listening) return;
    const finish = () => {
      const c = { ...buf.current, keys: [...buf.current.keys], gaps: [...buf.current.gaps] };
      buf.current = { text: "", gaps: [], enter: false, keys: [] };
      setCap(c);
      if (step === "scan") setStep("diagnose");
      if (step === "ticket") setStep(parseScan(c.text) ? "done" : "diagnose");
    };
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      const now = Date.now();
      const gap = last.current ? now - last.current : 0;
      last.current = now;
      if (timer.current) window.clearTimeout(timer.current);
      if (e.key === "Enter") {
        e.preventDefault();
        buf.current.enter = true;
        finish();
        return;
      }
      const ch = charFromKey(e.code, e.key);
      buf.current.keys.push({ key: e.key, code: e.code });
      if (ch) {
        // الفاصل يُحسب بين حروف الرشقة نفسها لا من آخر ضغطة قبلها
        if (buf.current.text) buf.current.gaps.push(gap);
        buf.current.text += ch;
      }
      // بلا Enter في الآخر: نختم بعد ثانية من آخر حرف — ونقول إن CR ناقص
      timer.current = window.setTimeout(finish, 1000);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [listening, step]);

  useEffect(() => {
    if (listening) zone.current?.focus();
  }, [listening]);

  const expected = step === "ticket" || (cap && cap.text === ticketCode) ? ticketCode : testCode;
  const retry = (to: Step) => {
    setCap(null);
    setBeeped(null);
    setStep(to);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4" dir="rtl">
      <h1 className="text-2xl font-black">فحص القارئ</h1>
      <p className="text-sm font-bold text-muted-foreground">
        اتبع الخطوات بالترتيب. الصفحة تقرأ ما يرسله القارئ فعلاً وتقول لك السبب إن لم يعمل.
      </p>

      {step === "connect" && (
        <Card icon={<Usb className="size-6" />} title="١ · وصّل القارئ بهذا الجهاز">
          <ol className="list-decimal space-y-2 ps-5 text-sm font-bold">
            <li>
              <b>USB:</b> ضع كابل القارئ في الجهاز. (الأضمن — بلا اقتران)
            </li>
            <li>
              <b>مستقبل 2.4G:</b> ضع المستقبل الصغير في USB، ثم من دليل القارئ امسح <Bar>2.4G Mode</Bar> ثم <Bar>Pair</Bar>.
            </li>
            <li>
              <b>Bluetooth:</b> من الدليل امسح <Bar>Bluetooth HID Mode</Bar> (لا BLE ولا SPP)، ثم ويندوز ← Bluetooth ← إضافة جهاز ← اختره — يجب أن يظهر كـ<b>لوحة مفاتيح</b>.
            </li>
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            {(
              [
                ["usb", "وصلته بـUSB"],
                ["dongle", "وصلته بالمستقبل 2.4G"],
                ["bt", "وصلته بالبلوتوث"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => {
                  setConn(k);
                  setStep("scan");
                }}
                className="rounded-xl bg-primary px-4 py-2 font-black text-primary-foreground"
              >
                {label} ←
              </button>
            ))}
          </div>
        </Card>
      )}

      {(step === "scan" || step === "ticket") && (
        <Card icon={<ScanLine className="size-6" />} title={step === "scan" ? "٢ · امسح هذا الرمز" : "٤ · امسح رمز تذكرة حقيقية"}>
          <div
            ref={zone}
            tabIndex={0}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className={`grid place-items-center gap-3 rounded-2xl border-4 p-4 outline-none ${focused ? "border-primary" : "border-destructive"}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={step === "scan" ? testQr : ticketQr} alt="" className="size-56" />
            <code dir="ltr" className="text-lg font-black tracking-widest">
              {step === "scan" ? testCode : ticketCode}
            </code>
            <p className="text-center text-sm font-bold">
              {focused ? "✅ الصفحة تستمع — وجّه القارئ إلى الرمز واضغط زرّه." : "⚠ اضغط بالفأرة داخل هذا الإطار أولاً، ثم امسح."}
            </p>
          </div>
          <button onClick={() => retry("diagnose")} className="mt-3 rounded-xl border-2 border-border px-4 py-2 text-sm font-bold">
            مسحت ولم يحدث شيء
          </button>
        </Card>
      )}

      {step === "diagnose" && (
        <Diagnosis cap={cap} expected={expected} conn={conn} beeped={beeped} setBeeped={setBeeped} onRetry={() => retry("scan")} onNext={() => retry("ticket")} />
      )}

      {step === "done" && (
        <Card icon={<CheckCircle2 className="size-6 text-green-700" />} title="٥ · القارئ جاهز ✅">
          <p className="text-sm font-bold">
            قرأ <code dir="ltr">{cap?.text}</code> كاملاً مع Enter{cap && Math.max(0, ...cap.gaps) > GAP_LIMIT ? " — لكن ببطء (بلوتوث)؛ إن تقطّعت التذاكر فاستخدم USB." : "."}
          </p>
          <Link href="/expediter" className="mt-3 inline-block rounded-xl bg-primary px-4 py-2 font-black text-primary-foreground">
            افتح شاشة التجهيز ←
          </Link>
        </Card>
      )}
    </div>
  );
}

function Diagnosis({
  cap,
  expected,
  conn,
  beeped,
  setBeeped,
  onRetry,
  onNext,
}: {
  cap: Capture | null;
  expected: string;
  conn: "usb" | "dongle" | "bt";
  beeped: boolean | null;
  setBeeped: (b: boolean) => void;
  onRetry: () => void;
  onNext: () => void;
}) {
  const text = cap?.text ?? "";
  const maxGap = cap ? Math.max(0, ...cap.gaps) : 0;
  const arabic = cap?.keys.some((k) => /[؀-ۿ]/.test(k.key)) ?? false;

  // ✅ صحيح تماماً
  if (cap && text === expected && cap.enter) {
    return (
      <Card icon={<CheckCircle2 className="size-6 text-green-700" />} title="٣ · وصل الرمز صحيحاً ✅">
        <p className="text-sm font-bold">
          <code dir="ltr">{text}</code> مع Enter، وأبطأ فاصل بين الحروف {maxGap}ms{maxGap > GAP_LIMIT ? ` (أبطأ من ${GAP_LIMIT} — ${conn === "bt" ? "البلوتوث بطيء؛ الأفضل USB" : "غريب على USB — جرّب منفذاً آخر"})` : " — ممتاز"}.
          {arabic && " الحروف وصلت عربية (لغة لوحة المفاتيح) والنظام يتحمّلها."}
        </p>
        <button onClick={onNext} className="mt-3 rounded-xl bg-primary px-4 py-2 font-black text-primary-foreground">
          التالي: تذكرة حقيقية ←
        </button>
      </Card>
    );
  }

  // لا شيء وصل
  if (!cap || !text) {
    return (
      <Card icon={<BookOpen className="size-6" />} title="٣ · لم يصل شيء من القارئ">
        {beeped === null ? (
          <>
            <p className="text-sm font-bold">حين مسحت، هل صفّر القارئ؟</p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => setBeeped(true)} className="flex items-center gap-1 rounded-xl border-2 border-border px-4 py-2 font-bold">
                <Volume2 className="size-4" /> نعم صفّر
              </button>
              <button onClick={() => setBeeped(false)} className="flex items-center gap-1 rounded-xl border-2 border-border px-4 py-2 font-bold">
                <VolumeX className="size-4" /> لا لم يصفّر
              </button>
            </div>
          </>
        ) : beeped ? (
          <>
            <p className="text-sm font-bold">يقرأ الرمز لكنه لا يكتب — الوصلة ليست في وضع «لوحة مفاتيح». افتح الدليل وامسح:</p>
            <ul className="mt-2 list-disc space-y-1 ps-5 text-sm font-bold">
              {conn === "usb" && (
                <li>
                  <Bar>USB HID Keyboard</Bar> (أو «USB-KBW»). ثم افصل الكابل وأعد وصله.
                </li>
              )}
              {conn === "dongle" && (
                <li>
                  <Bar>2.4G Mode</Bar> ثم <Bar>Pair</Bar> والمستقبل في الجهاز — انتظر الصفّارة الطويلة.
                </li>
              )}
              {conn === "bt" && (
                <li>
                  <Bar>Bluetooth HID Mode</Bar>، ثم في ويندوز احذف الجهاز القديم وأعد إضافته حتى يظهر كـ<b>لوحة مفاتيح</b>. إن بقي، استخدم USB.
                </li>
              )}
              <li>
                تأكد أن الصفحة كانت مظلّلة بالبرتقالي (مضغوطة بالفأرة) وقت المسح.
              </li>
            </ul>
          </>
        ) : (
          <>
            <p className="text-sm font-bold">لا يصفّر = لا يقرأ الرمز أصلاً:</p>
            <ul className="mt-2 list-disc space-y-1 ps-5 text-sm font-bold">
              <li>
                من الدليل امسح <Bar>Enable QR Code</Bar> (بعض القارئات تأتي وQR مطفأ).
              </li>
              <li>المسافة 10–20 سم، والرمز على شاشة غير لامعة أو مطبوع؛ نظّف عدسة القارئ.</li>
              <li>إن لم يصفّر مع أي رمز: القارئ غير مشحون أو مطفأ.</li>
            </ul>
          </>
        )}
        <button onClick={onRetry} className="mt-3 rounded-xl bg-primary px-4 py-2 font-black text-primary-foreground">
          أعد الفحص ←
        </button>
      </Card>
    );
  }

  // وصل شيء لكن ناقص/بلا Enter/غلط
  return (
    <Card icon={<Cable className="size-6" />} title="٣ · وصل شيء — لكن ليس كما يجب">
      <p className="text-sm font-bold">
        وصل: <code dir="ltr">{text}</code> — المتوقع: <code dir="ltr">{expected}</code>
      </p>
      <ul className="mt-2 list-disc space-y-1 ps-5 text-sm font-bold">
        {!cap.enter && (
          <li>
            لم يصل <b>Enter</b> في النهاية: من الدليل امسح <Bar>Add CR Suffix</Bar> (أو «Enter suffix» / «CR+LF»). ستيشن يختم الرمز بـEnter.
          </li>
        )}
        {maxGap > GAP_LIMIT && (
          <li>
            الفاصل بين الحروف وصل {maxGap}ms (الحد {GAP_LIMIT}) — {conn === "bt" ? "البلوتوث يتقطّع؛ استخدم USB أو المستقبل 2.4G." : "جرّب منفذ USB آخر أو كابلاً آخر."}
          </li>
        )}
        {text !== expected && cap.enter && (
          <li>
            الحروف مختلفة: {arabic ? "وصلت عربية — بدّل لغة لوحة مفاتيح ويندوز إلى ENG أو امسح من الدليل «Keyboard: US English»." : "امسح من الدليل «Keyboard: US English» وتأكد أن المسح كان لهذا الرمز لا لغيره."}
          </li>
        )}
        {text.length < expected.length && cap.enter && maxGap <= GAP_LIMIT && <li>الرمز ناقص: امسح من الدليل «Keyboard: US English» ثم أعد الفحص.</li>}
      </ul>
      <button onClick={onRetry} className="mt-3 rounded-xl bg-primary px-4 py-2 font-black text-primary-foreground">
        أعد الفحص ←
      </button>
    </Card>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border-2 border-border bg-card p-4">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-black">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

/** باركود إعداد من دليل القارئ — اسمه كما يُطبع هناك */
function Bar({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-secondary px-1.5 py-0.5 text-[13px]">{children}</code>;
}
