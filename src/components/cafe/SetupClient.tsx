"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Monitor, Printer, RefreshCw, Smartphone, X } from "lucide-react";
import { CopyButton } from "./CopyButton";

/**
 * /setup — the installation page, opened in the browser on the machine being
 * installed.
 *
 * The reason it exists: every value this system needs during installation
 * already exists somewhere on the machine — the printer's IP is in Windows,
 * the screen size is in the browser, the shop's address is in the URL bar.
 * Making somebody read those off one screen and type them into another is
 * where installation nights go wrong.
 *
 * So the page reads what it can and offers it as a button.
 */

/** what Windows knows about a printer, via the local agent */
type Found = { name: string; share: string | null; host: string | null; port: string | null; driver: string | null };

/** what the database expects to print, so the two can be compared */
export type MappedPrinter = {
  name: string;
  kind: "receipt" | "station" | "expediter";
  station: string | null;
  categories: string[];
  host: string | null;
  share: string | null;
  active: boolean;
};

export type ScreenLink = { title: string; note: string; url: string; qr: string; kiosk: string };

const AGENT = "http://127.0.0.1:9977";

export function SetupClient({
  installCommand,
  printers,
  screens,
  origin,
}: {
  installCommand: string;
  printers: MappedPrinter[];
  screens: ScreenLink[];
  origin: string;
}) {
  const [agent, setAgent] = useState<"checking" | "up" | "down">("checking");
  const [found, setFound] = useState<Found[] | null>(null);
  const [device, setDevice] = useState<{ w: number; h: number; touch: boolean; ua: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(
      () =>
        setDevice({
          w: window.screen.width,
          h: window.screen.height,
          touch: navigator.maxTouchPoints > 0,
          ua: navigator.userAgent,
        }),
      0,
    );
    return () => clearTimeout(t);
  }, []);

  const probe = useCallback(async () => {
    setAgent("checking");
    try {
      // The agent is only reachable from the machine it runs on, which is
      // exactly the test we want: "is THIS the cashier PC?"
      const res = await fetch(`${AGENT}/printers`, { signal: AbortSignal.timeout(2500) });
      setFound((await res.json()) as Found[]);
      setAgent("up");
    } catch {
      setAgent("down");
      setFound(null);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void probe(), 0);
    return () => clearTimeout(t);
  }, [probe]);

  const unconfigured = printers.filter((p) => !p.host && !p.share).length;
  // shown without the scheme: a TV keyboard makes "https://" eight wasted
  // keystrokes, and every browser adds it back
  const tvUrl = screens.find((s) => s.url.includes("/queue"))?.url.replace(/^https?:\/\//, "") ?? null;

  return (
    <div className="space-y-8 pb-16">
      <header>
        <h1 className="text-2xl font-black">تركيب النظام</h1>
        <p className="text-sm text-muted-foreground">افتح هذه الصفحة على الجهاز الذي تركّبه، واتبع الخطوات بالترتيب.</p>
      </header>

      {/* ── this device ── */}
      <section className="rounded-2xl border-2 border-border bg-card p-4">
        <h2 className="mb-3 flex items-center gap-2 font-black">
          {device?.touch ? <Smartphone className="size-5 text-primary" /> : <Monitor className="size-5 text-primary" />}
          هذا الجهاز
        </h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <Row k="قياس الشاشة" v={device ? `${device.w} × ${device.h}` : "…"} />
          <Row k="اللمس" v={device ? (device.touch ? "نعم — مناسب للمطبخ والتجهيز" : "لا — جهاز بلوحة مفاتيح") : "…"} />
          <Row k="عنوان النظام" v={origin} />
          <Row
            k="وكيل الطباعة"
            v={agent === "checking" ? "جارٍ الفحص…" : agent === "up" ? "يعمل ✅ — هذا جهاز الكاشير" : "غير موجود — هذا ليس جهاز الكاشير"}
          />
        </dl>
      </section>

      {/* ── 1. install ── */}
      <Step n={1} title="تركيب جهاز الكاشير">
        <p className="text-sm text-muted-foreground">
          على جهاز الكاشير فقط. افتح <b>PowerShell كمسؤول</b>، ألصق السطر، اضغط Enter.
          شاشات المطبخ والتجهيز والاستلام لا تطبع ولا تحتاج هذه الخطوة.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
          <code className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-secondary p-3 text-left text-xs" dir="ltr">
            {installCommand}
          </code>
          <CopyButton value={installCommand} label="نسخ أمر التركيب" />
        </div>
        <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
          <li>• يكتشف طابعة الفواتير ويشاركها باسم POS80</li>
          <li>• ينزّل وكيل الطباعة ويشغّله مع إقلاع الجهاز</li>
          <li>• يختبر فتح الدرج ويصنع اختصار «كاشير ستيشن»</li>
        </ul>
      </Step>

      {/* ── 2. detected printers ── */}
      <Step n={2} title="الطابعات الموجودة على هذا الجهاز">
        <div className="mb-3 flex items-center gap-2">
          <button onClick={() => void probe()} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-bold hover:bg-secondary">
            <RefreshCw className={`size-4 ${agent === "checking" ? "animate-spin" : ""}`} />
            إعادة الفحص
          </button>
          {agent === "down" && <span className="text-sm font-bold text-amber-600 dark:text-amber-400">نفّذ الخطوة ١ أولاً</span>}
        </div>

        {agent === "up" && found?.length ? (
          <div className="space-y-2">
            {found.map((f) => (
              <div key={f.name} className="rounded-xl border border-border bg-card p-3">
                <p className="font-bold">{f.name}</p>
                <p className="text-xs text-muted-foreground">{f.driver}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {f.host ? (
                    <>
                      <code className="rounded bg-secondary px-2 py-1 text-xs" dir="ltr">{f.host}</code>
                      <CopyButton value={f.host} label="نسخ العنوان" />
                    </>
                  ) : null}
                  {f.share ? (
                    <>
                      <code className="rounded bg-secondary px-2 py-1 text-xs" dir="ltr">{f.share}</code>
                      <CopyButton value={f.share} label="نسخ المشاركة" />
                    </>
                  ) : null}
                  {!f.host && !f.share ? (
                    <span className="text-xs font-bold text-muted-foreground">
                      بلا عنوان ولا مشاركة — شاركها من إعدادات ويندوز أولاً
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : agent === "up" ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            الوكيل يعمل لكن ويندوز لا يرى أي طابعة مثبّتة.
          </p>
        ) : (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            {agent === "checking" ? "جارٍ الفحص…" : "وكيل الطباعة لا يستجيب على هذا الجهاز."}
          </p>
        )}
      </Step>

      {/* ── 3. the map ── */}
      <Step n={3} title="ماذا يُطبع وأين">
        {unconfigured > 0 && (
          <p className="mb-3 flex items-start gap-2 rounded-xl border-2 border-amber-500 bg-amber-500/10 p-3 text-sm font-bold text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {unconfigured} طابعة بلا عنوان. انسخ القيم من الخطوة ٢ وألصقها في صفحة الطابعات.
          </p>
        )}
        <div className="space-y-2">
          {printers.map((p) => (
            <div key={p.name} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-bold">
                  <Printer className="size-4 text-primary" />
                  {p.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.kind === "receipt"
                    ? "فاتورة الزبون"
                    : p.kind === "expediter"
                      ? "تذكرة التجهيز — الـQR واسم الكاشير والمجهّز"
                      : p.categories.length
                        ? p.categories.join(" · ")
                        : "لا يوجد قسم موجّه إليها"}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-black ${p.host || p.share ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}>
                {p.host || p.share ? (p.active ? "جاهزة" : "معطّلة") : "بلا عنوان"}
              </span>
            </div>
          ))}
        </div>
        <a href="/printers" className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-bold text-primary-foreground">
          افتح صفحة الطابعات
        </a>
      </Step>

      {/* ── 4. screens ── */}
      <Step n={4} title="الشاشات">
        {/* The QR is scanned BY the other device, using its own camera. A
            ceiling television has no camera, so telling somebody to "scan it"
            there sends them up a ladder holding a phone for no reason. */}
        <div className="mb-3 space-y-2 rounded-xl border border-border bg-card p-3 text-sm">
          <p className="font-black">أي طريقة تستعمل؟ حسب الجهاز:</p>
          <p>
            📱 <b>جهاز فيه كاميرا</b> (تابلت المطبخ، التجهيز، منيو الزبون): افتح كاميرته وامسح الرمز من
            <b> هذه الشاشة التي أمامك الآن</b> — الرمز يُعرض هنا ويُمسح هناك، لا العكس.
          </p>
          <p>
            📺 <b>تلفاز ذكي على واي‑فاي المطعم</b>: لا تمسح شيئاً ولا تشغّل أمراً. افتح متصفح التلفاز
            واكتب العنوان بالريموت مرة واحدة، ثم اجعله <b>الصفحة الرئيسية</b> للمتصفح.
          </p>
          <p>
            💻 <b>شاشة يشغّلها جهاز ويندوز</b> (ميني PC أو TV Stick): ألصق «أمر التثبيت كتطبيق» على ذلك
            الجهاز — يضبط ملء الشاشة والتشغيل التلقائي ومنع النوم دفعة واحدة.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {screens.map((s) => (
            <div key={s.url} className="rounded-2xl border border-border bg-card p-3">
              <p className="font-black">{s.title}</p>
              <p className="mb-2 text-xs text-muted-foreground">{s.note}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.qr} alt="" aria-hidden className="mx-auto size-32 rounded-lg bg-white p-1" />
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 overflow-x-auto rounded bg-secondary px-2 py-1 text-[11px]" dir="ltr">{s.url}</code>
                <CopyButton value={s.url} label="نسخ" />
              </div>
              {/* a screen on the ceiling must never show a browser: this turns
                  a Windows device into a dedicated appliance in one command */}
              <div className="mt-2 border-t border-border pt-2">
                <CopyButton value={s.kiosk} label="نسخ أمر التثبيت كتطبيق" className="w-full justify-center" />
                <p className="mt-1 text-center text-[11px] text-muted-foreground">
                  ملء الشاشة · بلا متصفح · يبدأ وحده · لا ينام
                </p>
              </div>
            </div>
          ))}
        </div>
        {tvUrl && (
          <div className="mt-4 rounded-2xl border-2 border-primary/40 bg-primary/5 p-4">
            <p className="mb-1 font-black">📺 للتلفاز الذكي — اكتب هذا بالريموت</p>
            <p className="mb-3 text-xs text-muted-foreground">
              مرة واحدة فقط. بعدها: قائمة المتصفح ← اجعلها الصفحة الرئيسية.
            </p>
            <p className="overflow-x-auto rounded-xl bg-background p-3 text-center text-xl font-black tracking-wide" dir="ltr">
              {tvUrl}
            </p>
            <div className="mt-2 flex justify-center">
              <CopyButton value={tvUrl} label="نسخ العنوان" />
            </div>
          </div>
        )}
      </Step>

      {/* ── 5. final check ── */}
      <Step n={5} title="الفحص قبل المغادرة">
        <p className="mb-2 text-sm text-muted-foreground">اطلب: بيتزا + برجر + فرايس + زنجر. يجب أن تخرج ٥ أوراق من ٤ طابعات.</p>
        <ul className="space-y-1.5 text-sm">
          {[
            "الكاونتر: فاتورة الزبون — والعربي متصل",
            "الكاونتر: تذكرة التجهيز، وعليها QR",
            "فرن البيتزا: البيتزا فقط",
            "مطبخ البرجر: البرجر والفرايس",
            "الشواية: الزنجر فقط",
            "الدرج فتح عند الدفع",
            "امسح الـQR ← الطلب صار «جاهز» على شاشة الاستلام",
            "اقطع الإنترنت دقيقتين ← الكاشير يستمر ويطبع، ثم ترتفع الطلبات وحدها",
          ].map((t) => (
            <li key={t} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              {t}
            </li>
          ))}
        </ul>
      </Step>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-black">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">{n}</span>
        {title}
      </h2>
      <div className="rounded-2xl border border-border bg-background p-4">{children}</div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-secondary/50 px-3 py-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="min-w-0 truncate font-bold" dir="auto">{v}</dd>
    </div>
  );
}

export { X };
