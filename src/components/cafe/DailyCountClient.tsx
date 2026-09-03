"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Lock, Printer } from "lucide-react";
import { PriceInput } from "./PriceInput";
import { formatIqdLabel } from "@/lib/cafe/money";
import { printJobs } from "@/lib/cafe/print-client";
import { buildDailyCountPrint, saveDailyCount, type DailyCount } from "@/lib/cafe/daily-count";

/**
 * «جرد اليوم» — the sheet somebody signs at the end of the night.
 *
 * Three fields are editable and nothing else. The sales figures are what the
 * system recorded; anyone who can edit those can hide a theft, and the note is
 * where a difference is explained rather than erased.
 *
 * Two ways out: the till's own thermal printer for the strip that gets signed
 * and spiked, and the browser's print dialog for an A4 sheet — which is also
 * how it becomes a PDF, with no library and with Arabic that always joins,
 * because the browser draws it.
 */
export function DailyCountClient({ initial, cashier }: { initial: DailyCount; cashier: string }) {
  const router = useRouter();
  const [counted, setCounted] = useState(initial.counted_cash);
  const [deposited, setDeposited] = useState(initial.count_deposited);
  const [note, setNote] = useState(initial.note ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const d = initial;
  const locked = !!d.closed_at;
  const diff = counted - d.expected_cash;

  async function save(close: boolean) {
    if (close && !confirm("إقفال الجرد يمنع تعديله بعد ذلك. متأكد؟")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await saveDailyCount({ day: d.day, counted, deposited, note, close });
      setMsg(res.ok ? (close ? "أُقفل الجرد ✓" : "حُفظ ✓") : res.error);
      if (res.ok) router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "تعذّر الحفظ.");
    } finally {
      setBusy(false);
    }
  }

  async function printStrip() {
    setBusy(true);
    setMsg(null);
    try {
      // Saved first: the strip is built on the server from what is stored, so
      // printing an unsaved count would hand somebody a paper that disagrees
      // with the screen they are looking at.
      await saveDailyCount({ day: d.day, counted, deposited, note });
      const res = await buildDailyCountPrint(d.day);
      if (!res.ok) return setMsg(res.error);
      const out = await printJobs([res.job]);
      // the agent's reason when it gave one — «printer is Offline» — not a guess
      setMsg(out.sent > 0 ? "أُرسل الشريط إلى طابعة الكاشير ✓" : `${out.errors[0] ?? "وكيل الطباعة لا يستجيب"} — استعمل «ورقة A4».`);
      router.refresh();
    } catch (e) {
      // This had try/finally and no catch: any throw above vanished, the button
      // spun and went quiet, and the owner reported «لا يعمل» with nothing to quote.
      setMsg(e instanceof Error ? e.message : "تعذّرت الطباعة.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 pb-16 print:p-8">
      <header className="print:hidden">
        <h1 className="flex items-center gap-2 text-2xl font-black">
          <ClipboardCheck className="size-7 text-primary" />
          جرد اليوم
        </h1>
        <p className="text-sm text-muted-foreground">
          {d.day}
          {locked && <span className="mr-2 rounded-full bg-secondary px-2 py-0.5 text-xs font-black">مُقفل</span>}
        </p>
      </header>

      {/* ── the count itself ── */}
      <section className="rounded-2xl border-2 border-primary bg-card p-4 print:hidden">
        <h2 className="mb-3 font-black">الصندوق</h2>
        <Row label="المبلغ الافتتاحي" value={formatIqdLabel(d.opening_float)} />
        <Row label="مبيعات نقدية" value={formatIqdLabel(d.cash_sales)} tone="plus" />
        <Row label="مصروفات" value={`- ${formatIqdLabel(d.expenses)}`} tone="minus" />
        <Row label="مودع للإدارة" value={`- ${formatIqdLabel(d.deposited)}`} tone="minus" />
        <Row label="المتوقع في الصندوق" value={formatIqdLabel(d.expected_cash)} tone="big" />

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-bold">النقد الموجود فعلاً (عُدّه الآن)</span>
            <PriceInput value={counted} onChange={setCounted} />
          </label>
          <label className="block text-sm">
            <span className="font-bold">المُسلَّم للإدارة</span>
            <PriceInput value={deposited} onChange={setDeposited} />
          </label>
        </div>

        {/* The one number this whole page exists to produce. */}
        <div
          className={`mt-4 rounded-2xl p-4 text-center text-xl font-black ${
            diff === 0 ? "bg-success text-success-foreground" : "bg-destructive text-white"
          }`}
        >
          {diff === 0 ? "مطابق ✓" : diff > 0 ? `زيادة ${formatIqdLabel(diff)}` : `عجز ${formatIqdLabel(-diff)}`}
        </div>

        <label className="mt-3 block text-sm">
          <span className="font-bold">ملاحظة — سبب الفرق إن وُجد</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            disabled={locked}
            placeholder="مثال: نقص ٥٬٠٠٠ — صرف بنزين للمولد بلا وصل"
            className="mt-1 block w-full rounded-xl border-2 border-input bg-background p-3 text-sm outline-none focus:border-primary disabled:opacity-60"
          />
        </label>

        {msg && <p className="mt-3 rounded-xl bg-secondary p-2.5 text-sm font-bold">{msg}</p>}

        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <button onClick={() => void save(false)} disabled={busy || locked} className="min-h-12 rounded-xl border-2 border-border font-black disabled:opacity-40">
            حفظ
          </button>
          <button onClick={() => void printStrip()} disabled={busy} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary font-black text-primary-foreground disabled:opacity-40">
            <Printer className="size-5" />
            شريط الكاشير
          </button>
          <button onClick={() => window.print()} className="min-h-12 rounded-xl border-2 border-primary font-black text-primary">
            ورقة A4 / PDF
          </button>
          <button onClick={() => void save(true)} disabled={busy || locked} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-destructive font-black text-white disabled:opacity-40">
            <Lock className="size-5" />
            إقفال
          </button>
        </div>
      </section>

      {/* ── the rest of the day, read only ── */}
      <section className="grid gap-4 sm:grid-cols-2 print:hidden">
        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-2 font-black">خارج الصندوق</h2>
          <Row label="مبيعات كي كارد" value={formatIqdLabel(d.card_sales)} />
          <Row label="على شركات التوصيل" value={formatIqdLabel(d.partner_sales)} />
          <Row label="ديون صدرت اليوم" value={formatIqdLabel(d.debts_issued)} />
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-2 font-black">اليوم</h2>
          <Row label="المبيعات" value={formatIqdLabel(d.sales)} />
          {/* الأرباح للإدارة وحدها — والخادم لا يرسلها أصلاً لغيرها، فهذه
              الشروط تصف ما وصل لا ما يُخفى. */}
          {d.profit !== null && <Row label="الأرباح" value={formatIqdLabel(d.profit)} />}
          {d.fixed_cost !== null && (
            <Row label="الثابتة (أجور وإيجار)" value={`- ${formatIqdLabel(d.fixed_cost)}`} tone="minus" />
          )}
          {d.net !== null && <Row label="الصافي" value={formatIqdLabel(d.net)} tone="big" />}
          <Row label="الطلبات" value={String(d.orders_count)} />
          <Row label="الزبائن" value={String(d.guests)} />
        </div>
        {/* الصرفيات مقسّمة. كان المجموع وحده يُعرض، فلا يعرف أحد أين ذهب. */}
        {d.expenses_by_category.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-2 font-black">الصرفيات</h2>
            {d.expenses_by_category.map((e) => (
              <Row key={e.category} label={e.category} value={formatIqdLabel(e.amount)} />
            ))}
            <Row label="المجموع" value={formatIqdLabel(d.expenses)} tone="big" />
            {d.staff_advances > 0 && (
              <Row label="منها سلف موظفين" value={formatIqdLabel(d.staff_advances)} />
            )}
          </div>
        )}

        {/* الإلغاء: يُعدّ ولا يُطرح — الطلب الملغى ليس مبيعة، لكنه حدث يُرى. */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-2 font-black">الإلغاء والخصم</h2>
          <Row label="طلبات ملغاة" value={String(d.cancelled_count)} />
          <Row label="قيمتها" value={formatIqdLabel(d.cancelled_amount)} />
          <Row label="خصومات مُنحت" value={formatIqdLabel(d.discounts)} />
        </div>

        {d.partners.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-4 sm:col-span-2">
            <h2 className="mb-2 font-black">شركات التوصيل</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right text-xs font-black text-muted-foreground">
                    <th className="py-1">الشركة</th>
                    <th>طلبات</th>
                    <th>المبيعات</th>
                    <th>ملغاة</th>
                    <th>خصم</th>
                    <th>الباقي عليها</th>
                  </tr>
                </thead>
                <tbody>
                  {d.partners.map((p) => (
                    <tr key={p.partner_id} className="border-t border-border">
                      <td className="py-1.5 font-bold">{p.name_ar}</td>
                      <td className="tabular-nums">{p.orders_count}</td>
                      <td className="tabular-nums">{formatIqdLabel(p.sales)}</td>
                      <td className="tabular-nums">
                        {p.cancelled_count > 0 ? `${p.cancelled_count} · ${formatIqdLabel(p.cancelled_amount)}` : "—"}
                      </td>
                      <td className="tabular-nums">{formatIqdLabel(p.discounts)}</td>
                      <td className="font-black tabular-nums">{formatIqdLabel(p.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-2 font-black">أرصدة</h2>
          {d.stock_value !== null && <Row label="قيمة المخزون" value={formatIqdLabel(d.stock_value)} />}
          <Row label="لنا على شركات التوصيل" value={formatIqdLabel(d.partners_owed)} />
          <Row label="لنا على الزبائن" value={formatIqdLabel(d.customers_owed)} />
        </div>
        {d.sessions.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-2 font-black">ورديات اليوم</h2>
            {d.sessions.map((s) => (
              <div key={s.id} className="border-b border-dashed border-border py-1.5 text-sm last:border-0">
                <div className="flex justify-between font-bold">
                  <span>{s.cashier_name}</span>
                  <span className="text-muted-foreground" dir="ltr">
                    {s.opened_at.slice(11, 16)} — {s.closed_at ? s.closed_at.slice(11, 16) : "مفتوحة"}
                  </span>
                </div>
                {s.variance != null && (
                  <div className={`text-xs font-bold ${s.variance === 0 ? "text-success" : "text-destructive"}`}>
                    {s.variance === 0 ? "مطابقة" : s.variance > 0 ? `زيادة ${formatIqdLabel(s.variance)}` : `عجز ${formatIqdLabel(-s.variance)}`}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── A4 sheet: hidden on screen, the only thing that prints ──
          Same mechanism the inventory purchase sheet already uses. The @page
          override lands A4 rather than the 80mm the receipt rule assumes, and
          the browser's own "Save as PDF" is the PDF — no library, and Arabic
          that always joins because the browser is drawing it. */}
      <div className="receipt-print hidden print:block" dir="rtl">
        <style>{"@media print { @page { size: A4; margin: 14mm } .receipt-print { width: auto } }"}</style>
        <h1 style={{ fontSize: 22, fontWeight: 900, textAlign: "center", margin: 0 }}>جرد اليوم</h1>
        <p style={{ textAlign: "center", margin: "2mm 0 6mm" }}>
          ستيشن — {d.day} — الجرد: {cashier}
        </p>

        <A4Table
          title="الصندوق"
          rows={[
            ["المبلغ الافتتاحي", formatIqdLabel(d.opening_float)],
            ["مبيعات نقدية", formatIqdLabel(d.cash_sales)],
            ["مصروفات", `- ${formatIqdLabel(d.expenses)}`],
            ["مودع للإدارة", `- ${formatIqdLabel(d.deposited)}`],
            ["المتوقع في الصندوق", formatIqdLabel(d.expected_cash)],
            ["النقد المعدود", formatIqdLabel(counted)],
            [diff === 0 ? "مطابق" : diff > 0 ? "زيادة" : "عجز", formatIqdLabel(Math.abs(diff))],
          ]}
        />
        <A4Table
          title="خارج الصندوق"
          rows={[
            ["مبيعات كي كارد", formatIqdLabel(d.card_sales)],
            ["على شركات التوصيل", formatIqdLabel(d.partner_sales)],
            ["ديون صدرت اليوم", formatIqdLabel(d.debts_issued)],
          ]}
        />
        <A4Table
          title="اليوم"
          rows={[
            ["المبيعات", formatIqdLabel(d.sales)],
            ...(d.profit !== null ? [["الأرباح", formatIqdLabel(d.profit)] as [string, string]] : []),
            ...(d.fixed_cost !== null ? [["الثابتة (أجور وإيجار)", `- ${formatIqdLabel(d.fixed_cost)}`] as [string, string]] : []),
            ...(d.net !== null ? [["الصافي", formatIqdLabel(d.net)] as [string, string]] : []),
            ["عدد الطلبات", String(d.orders_count)],
            ["عدد الزبائن", String(d.guests)],
          ]}
        />
        <A4Table
          title="أرصدة"
          rows={[
            ...(d.stock_value !== null ? [["قيمة المخزون", formatIqdLabel(d.stock_value)] as [string, string]] : []),
            ["لنا على شركات التوصيل", formatIqdLabel(d.partners_owed)],
            ["لنا على الزبائن", formatIqdLabel(d.customers_owed)],
          ]}
        />
        {note && (
          <p style={{ marginTop: "5mm" }}>
            <b>ملاحظة:</b> {note}
          </p>
        )}
        <p style={{ marginTop: "12mm" }}>التوقيع: ..............................</p>
      </div>
    </div>
  );
}

/** One labelled figure. Hoisted out of the component: a function component
 *  created during render is a new type every pass, which remounts its subtree
 *  and is what the React compiler refuses. */
function Row({ label, value, tone }: { label: string; value: string; tone?: "plus" | "minus" | "big" }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 border-b border-dashed border-border py-1.5 last:border-0 ${tone === "big" ? "text-lg font-black" : ""}`}>
      <span className={tone === "big" ? "" : "text-muted-foreground"}>{label}</span>
      <span className={`tabular-nums font-bold ${tone === "minus" ? "text-destructive" : tone === "plus" ? "text-success" : ""}`}>{value}</span>
    </div>
  );
}

/** Plain table with inline styles — print CSS is the one place Tailwind is not worth trusting. */
function A4Table({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div style={{ marginBottom: "5mm" }}>
      <h2 style={{ fontSize: 15, fontWeight: 900, margin: "0 0 1mm", borderBottom: "1px solid #000" }}>{title}</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td style={{ padding: "1.2mm 0", borderBottom: "1px dotted #999" }}>{k}</td>
              <td style={{ padding: "1.2mm 0", borderBottom: "1px dotted #999", textAlign: "left", fontWeight: 700 }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
