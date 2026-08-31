"use client";

import { useEffect, useState } from "react";
import { Printer, Wifi, WifiOff } from "lucide-react";
import { buildTestJob, savePrinter, type PrinterConfig } from "@/lib/cafe/printer-actions";
import { agentAlive, agentPrinters, printJobs, pendingPrintCount, clearPrintQueue, type AgentPrinter } from "@/lib/cafe/print-client";

/**
 * /printers — wire the 5 physical printers to the routing that already exists.
 *
 * The whole point of this screen is that buying and cabling printers is not a
 * code change. routeOrder decides WHAT prints from categories.station_id; this
 * decides WHERE, and both are rows in the database.
 *
 * There is no codepage choice here, and no Arabic setting of any kind. There
 * used to be: a cp1256/utf8 toggle, a per-printer code-page number, and a test
 * for each. The shop's printer has no Arabic code page at any of its 56 slots —
 * it answered in Cyrillic, Greek, Thai and Chinese — so every one of those
 * controls was a way to get Arabic wrong and none was a way to get it right.
 * Arabic is drawn as a picture by the till agent now, and a picture prints the
 * same on every thermal printer ever made.
 */
export function PrintersClient({ printers, isAdmin }: { printers: PrinterConfig[]; isAdmin: boolean }) {
  const [rows, setRows] = useState(printers);
  const [agent, setAgent] = useState<boolean | null>(null);
  const [queued, setQueued] = useState(0);
  /** what Windows on this till actually has — asked, not typed */
  const [found, setFound] = useState<AgentPrinter[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    // deferred a tick: a synchronous setState in an effect body is a
    // cascading render under React 19
    const t = setTimeout(() => {
      void agentAlive().then(setAgent);
      void agentPrinters().then(setFound);
      setQueued(pendingPrintCount());
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  function patch(id: string, changes: Partial<PrinterConfig>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...changes } : r)));
  }

  async function save(p: PrinterConfig) {
    const res = await savePrinter({
      id: p.id,
      host: p.host,
      port: p.port,
      share: p.share,
      copies: p.copies,
      is_active: p.is_active,
    });
    setMsg(res.ok ? `تم حفظ ${p.name_ar}` : res.error);
  }

  async function test(p: PrinterConfig) {
    if (!p.host && !p.share) {
      setMsg("أدخل عنوان IP أو اسم الطابعة كما يظهر في ويندوز.");
      return;
    }
    const job = await buildTestJob(p.id);
    if (!job) return;
    const out = await printJobs([job]);
    setQueued(pendingPrintCount());
    setMsg(out.sent > 0 ? `أُرسلت صفحة اختبار إلى ${p.name_ar}` : "تعذّر الوصول إلى وكيل الطباعة المحلي.");
  }

  return (
    <div className="touch-pos space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">الطابعات</h1>
          <p className="text-sm font-bold text-muted-foreground">
            توجيه الأصناف يأتي من فئات المنيو — هنا تحدَّد الأجهزة فقط.
          </p>
        </div>
        <span
          className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold ${
            agent === null
              ? "bg-muted text-muted-foreground"
              : agent
                ? "bg-primary/10 text-primary"
                : "bg-destructive/10 text-destructive"
          }`}
        >
          {agent ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
          {agent === null ? "…" : agent ? "وكيل الطباعة يعمل" : "وكيل الطباعة متوقف"}
        </span>
      </header>

      {agent === false && (
        <div className="rounded-2xl border-2 border-destructive bg-destructive/5 p-4 text-sm font-bold">
          <p className="mb-2">وكيل الطباعة المحلي غير مشغّل على هذا الجهاز. شغّله مرة واحدة على حاسبة الكاشير:</p>
          <code className="block overflow-x-auto rounded-lg bg-cocoa px-3 py-2 text-xs text-white" dir="ltr">
            powershell -ExecutionPolicy Bypass -File scripts\print-agent.ps1 -Install
          </code>
        </div>
      )}

      {queued > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-kraft bg-kraft/10 p-4 text-sm font-bold">
          <span>{queued} تذكرة بانتظار طابعة كانت غير متاحة — ستُطبع تلقائياً مع أول طلب قادم.</span>
          <button
            onClick={() => {
              clearPrintQueue();
              setQueued(0);
            }}
            className="shrink-0 rounded-xl border-2 border-border px-3 py-1.5 hover:bg-secondary"
          >
            تجاهلها
          </button>
        </div>
      )}

      {msg && <p className="rounded-2xl border-2 border-primary bg-primary/10 px-4 py-3 font-bold text-primary">{msg}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((p) => (
          <article key={p.id} className="space-y-3 rounded-2xl border-2 border-border bg-card p-4">
            <header className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Printer className={`size-5 ${p.is_active ? "text-primary" : "text-muted-foreground"}`} />
                <div>
                  <p className="font-black">{p.name_ar}</p>
                  <p className="text-xs font-bold text-muted-foreground">
                    {p.kind === "receipt" ? "فاتورة الزبون" : p.kind === "expediter" ? "تذكرة التجهيز" : `محطة: ${p.station_name ?? "—"}`}
                  </p>
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={p.is_active}
                  onChange={(e) => patch(p.id, { is_active: e.target.checked })}
                  className="size-5 accent-[#FF6B00]"
                  disabled={!isAdmin}
                />
                مفعّلة
              </label>
            </header>

            <div className="grid grid-cols-2 gap-2">
              <Field label="عنوان IP">
                <input
                  value={p.host ?? ""}
                  onChange={(e) => patch(p.id, { host: e.target.value })}
                  placeholder="192.168.1.51"
                  dir="ltr"
                  disabled={!isAdmin}
                  className="w-full rounded-xl border-2 border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </Field>
              <Field label="المنفذ">
                <input
                  type="number"
                  value={p.port}
                  onChange={(e) => patch(p.id, { port: Number(e.target.value) })}
                  dir="ltr"
                  disabled={!isAdmin}
                  className="w-full rounded-xl border-2 border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </Field>
              <Field label="أو اسم الطابعة في ويندوز (أو اسم المشاركة)">
                <input
                  value={p.share ?? ""}
                  onChange={(e) => patch(p.id, { share: e.target.value })}
                  placeholder="POS80"
                  dir="ltr"
                  disabled={!isAdmin}
                  className="w-full rounded-xl border-2 border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
                {/* The names on this till are POS80, POS80-25, POS-24, POS-23:
                    four of them, two characters apart, read off one screen and
                    retyped into another. A tap cannot make that typo, and the
                    typo it prevents sends the burger order to the pizza oven
                    where nobody notices until a customer complains.
                    Filling also ticks «مفعّلة» — a name typed into a printer
                    nobody switched on is the same as no name at all. */}
                {isAdmin && found.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {found.map((f) => (
                      <button
                        key={f.name}
                        type="button"
                        onClick={() => patch(p.id, { share: f.share || f.name, host: null, is_active: true })}
                        className={`rounded-lg border px-2 py-1 text-xs font-bold transition ${
                          (p.share ?? "") === (f.share || f.name)
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border hover:bg-secondary"
                        }`}
                        dir="ltr"
                      >
                        {f.share || f.name}
                      </button>
                    ))}
                  </div>
                )}
              </Field>
              <Field label="عدد النسخ">
                <input
                  type="number"
                  min={1}
                  max={3}
                  value={p.copies}
                  onChange={(e) => patch(p.id, { copies: Number(e.target.value) })}
                  dir="ltr"
                  disabled={!isAdmin}
                  className="w-full rounded-xl border-2 border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </Field>
            </div>

            {/* Nothing to choose any more.
                There used to be a codepage toggle and a codepage number here,
                and a test for each. The shop's printer turned out to have no
                Arabic page at any of its 56 slots, so every one of those
                controls was a way to get Arabic wrong and none was a way to get
                it right. Arabic is drawn as a picture now, and a picture prints
                the same on every thermal printer ever made. */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => void test(p)}
                className="min-h-11 rounded-xl border-2 border-border text-sm font-bold hover:bg-secondary"
              >
                اختبار الطباعة
              </button>
              <button
                onClick={() => void save(p)}
                disabled={!isAdmin}
                className="min-h-11 rounded-xl bg-primary text-sm font-black text-primary-foreground shadow-station hover:opacity-90 disabled:opacity-40"
              >
                حفظ
              </button>
            </div>
          </article>
        ))}
      </div>

      <p className="rounded-2xl border-2 border-dashed border-border p-4 text-sm font-bold text-muted-foreground">
        اطبع صفحة الاختبار بالترميزين واختر الذي تظهر فيه الحروف <span className="text-foreground">متصلة</span> — يعتمد ذلك
        على الطابعة نفسها وليس على النظام.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-bold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
