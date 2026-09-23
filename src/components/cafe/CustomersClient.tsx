"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronDown, Download, Pencil, RefreshCw, Search, Users } from "lucide-react";
import {
  exportCustomers,
  listCustomerOrders,
  syncCustomerBook,
  updateCustomer,
  type CustomerBook,
  type CustomerOrder,
  type CustomerRow,
  type ExportFormat,
} from "@/lib/cafe/customer-actions";
import { formatIqdLabel } from "@/lib/cafe/money";

/**
 * سجلّ أرقام الزبائن.
 *
 * الفرز والبحث في المتصفّح لا في القاعدة: مئتا صفّ تُرسَل مرّةً واحدة، وكل
 * ضغطة على «الأكثر إنفاقاً» بعدها فورية بلا دورة خادم. وحين تكبر القائمة
 * إلى آلاف يُنقل الفرز إلى العرض نفسه.
 */

const SORTS = {
  orders: { label: "الأكثر طلباً", by: (a: CustomerRow, b: CustomerRow) => b.orders_count - a.orders_count },
  spent: { label: "الأكثر إنفاقاً", by: (a: CustomerRow, b: CustomerRow) => b.total_spent - a.total_spent },
  recent: { label: "آخر زيارة", by: (a: CustomerRow, b: CustomerRow) => (b.last_order ?? "").localeCompare(a.last_order ?? "") },
  oldest: { label: "أقدم زبون", by: (a: CustomerRow, b: CustomerRow) => (a.first_order ?? "￿").localeCompare(b.first_order ?? "￿") },
} as const;
type SortKey = keyof typeof SORTS;

const CHANNEL: Record<string, string> = {
  cashier: "الكاشير",
  takeaway: "سفري",
  delivery: "توصيل",
  curbside: "السيارة",
  pickup: "استلام",
};

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

export function CustomersClient({ book, failed }: { book: CustomerBook; failed: string | null }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("orders");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id: string; name: string; phone: string } | null>(null);
  // سجلّ زبونٍ واحد يُجلب عند فتحه لا مع الصفحة: مئتا زبون × خمسٍ وعشرين طلباً
  // حمولةٌ لا يقرأ منها أحدٌ سطراً واحداً
  const [open, setOpen] = useState<string | null>(null);
  const [log, setLog] = useState<Record<string, CustomerOrder[] | "…">>({});

  async function expand(r: CustomerRow) {
    if (open === r.id) return setOpen(null);
    setOpen(r.id);
    if (log[r.id] || !r.phone) return;
    setLog((m) => ({ ...m, [r.id]: "…" }));
    const rows = await listCustomerOrders(r.phone).catch(() => []);
    setLog((m) => ({ ...m, [r.id]: rows }));
  }

  const shown = useMemo(() => {
    const needle = q.trim().replace(/\s+/g, "");
    const digits = needle.replace(/\D/g, "");
    const rows = book.rows.filter((r) => {
      if (!needle) return true;
      if (digits && (r.phone ?? "").includes(digits)) return true;
      return (r.name ?? "").includes(q.trim());
    });
    return [...rows].sort(SORTS[sort].by);
  }, [book.rows, q, sort]);

  const totals = useMemo(
    () => ({
      people: book.rows.length,
      repeat: book.rows.filter((r) => r.orders_count > 1).length,
      spent: book.rows.reduce((t, r) => t + r.total_spent, 0),
    }),
    [book.rows],
  );

  async function sync() {
    setBusy(true);
    setMsg(null);
    const r = await syncCustomerBook();
    setBusy(false);
    setMsg(r.ok ? `تمّ التحديث — ${r.added} رقماً جديداً، ${r.named} اسماً، ${r.auto_named} تسمية تلقائية` : r.error);
    if (r.ok) router.refresh();
  }

  /** الملفّ يُبنى على الخادم وينزل من الذاكرة — لا مسار عامّ يحمل أرقام الزبائن */
  async function download(format: ExportFormat) {
    setBusy(true);
    setMsg(null);
    const r = await exportCustomers(format, shown.length === book.rows.length ? undefined : shown.map((x) => x.id));
    setBusy(false);
    if (!r.ok) return;
    const type = format === "vcf" ? "text/vcard;charset=utf-8" : "text/csv;charset=utf-8";
    const url = URL.createObjectURL(new Blob([r.body], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = r.filename;
    a.click();
    URL.revokeObjectURL(url);
    setMsg(`نُزّل ${shown.length} رقماً`);
  }

  async function saveEdit() {
    if (!edit) return;
    setBusy(true);
    const r = await updateCustomer(edit.id, { name: edit.name, phone: edit.phone });
    setBusy(false);
    setMsg(r.ok ? "حُفظ ✅" : r.error);
    if (r.ok) {
      setEdit(null);
      router.refresh();
    }
  }

  if (failed) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">الزبائن</h1>
        <p className="rounded-2xl border-2 border-destructive bg-destructive/10 px-4 py-3 font-bold text-destructive">{failed}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Users className="size-6 text-primary" />
            الزبائن
          </h1>
          <p className="text-sm font-bold text-muted-foreground">
            {totals.people} رقماً · {totals.repeat} عادوا أكثر من مرّة · {formatIqdLabel(totals.spent)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void sync()}
            disabled={busy}
            className="flex min-h-11 items-center gap-1.5 rounded-full border-2 border-border px-4 text-sm font-black transition hover:bg-secondary disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
            تحديث السجلّ
          </button>
          <button
            onClick={() => void download("vcf")}
            disabled={busy || !shown.length}
            className="flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-black text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            <Download className="size-4" />
            إلى جهات الاتصال
          </button>
          <button
            onClick={() => void download("csv")}
            disabled={busy || !shown.length}
            className="flex min-h-11 items-center gap-1.5 rounded-full border-2 border-primary px-4 text-sm font-black text-primary transition hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
          >
            <Download className="size-4" />
            جدول CSV
          </button>
        </div>
      </div>

      {msg && <p className="rounded-xl border-2 border-border bg-card px-3 py-2 text-sm font-black">{msg}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-52">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث باسم أو رقم…"
            className="w-full rounded-xl border-2 border-border bg-card py-2.5 pe-3 ps-9 text-base font-bold outline-none focus:border-primary"
          />
        </label>
        {(Object.keys(SORTS) as SortKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setSort(k)}
            className={`min-h-11 rounded-full px-4 text-sm font-black transition ${
              sort === k ? "bg-primary text-primary-foreground" : "border-2 border-border hover:bg-secondary"
            }`}
          >
            {SORTS[k].label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border-2 border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-right text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">الاسم</th>
              <th className="px-4 py-2.5 font-medium">الرقم</th>
              <th className="px-4 py-2.5 font-medium">الطلبات</th>
              <th className="px-4 py-2.5 font-medium">الإنفاق</th>
              <th className="px-4 py-2.5 font-medium">أول زيارة</th>
              <th className="px-4 py-2.5 font-medium">آخر زيارة</th>
              <th className="px-4 py-2.5 font-medium">الغالب</th>
              <th className="px-4 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                  {book.rows.length ? "لا نتيجة لهذا البحث." : "لا أرقام بعد — اضغط «تحديث السجلّ»."}
                </td>
              </tr>
            )}
            {shown.map((r) => (
              <Fragment key={r.id}>
              <tr className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2.5 font-bold">
                  {edit?.id === r.id ? (
                    <input
                      value={edit.name}
                      onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                      className="w-36 rounded-lg border-2 border-primary bg-background px-2 py-1 font-bold outline-none"
                    />
                  ) : (
                    <span className={r.auto_named ? "text-muted-foreground" : ""}>{r.name ?? "—"}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 tabular-nums" dir="ltr">
                  {edit?.id === r.id ? (
                    <input
                      value={edit.phone}
                      onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
                      dir="ltr"
                      className="w-36 rounded-lg border-2 border-primary bg-background px-2 py-1 tabular-nums outline-none"
                    />
                  ) : (
                    <button onClick={() => void expand(r)} className="flex items-center gap-1 font-bold text-primary hover:underline">
                      {r.phone ?? "—"}
                      <ChevronDown className={`size-3.5 transition ${open === r.id ? "rotate-180" : ""}`} />
                    </button>
                  )}
                </td>
                <td className="px-4 py-2.5 font-black tabular-nums">{r.orders_count}</td>
                <td className="px-4 py-2.5 tabular-nums">{formatIqdLabel(r.total_spent)}</td>
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground" dir="ltr">
                  {day(r.first_order)}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground" dir="ltr">
                  {day(r.last_order)}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{CHANNEL[r.top_channel ?? ""] ?? "—"}</td>
                <td className="px-4 py-2.5">
                  {edit?.id === r.id ? (
                    <button onClick={() => void saveEdit()} disabled={busy} className="flex items-center gap-1 text-xs font-black text-primary">
                      <Check className="size-4" />
                      حفظ
                    </button>
                  ) : (
                    <button
                      onClick={() => setEdit({ id: r.id, name: r.name ?? "", phone: r.phone ?? "" })}
                      className="flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-primary"
                    >
                      <Pencil className="size-3.5" />
                      تعديل
                    </button>
                  )}
                </td>
              </tr>
              {open === r.id ? (
                <tr className="border-b border-border/60 bg-secondary/40">
                  <td colSpan={8} className="px-4 py-3">
                    {log[r.id] === "…" ? (
                      <span className="text-sm font-bold text-muted-foreground">…</span>
                    ) : (log[r.id] ?? []).length === 0 ? (
                      <span className="text-sm font-bold text-muted-foreground">لا طلبات مدفوعة بهذا الرقم.</span>
                    ) : (
                      <ul className="grid gap-1.5">
                        {(log[r.id] as CustomerOrder[]).map((o) => (
                          <li key={o.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                            <span className="font-black tabular-nums text-primary">#{String(o.order_seq).padStart(3, "0")}</span>
                            <span className="tabular-nums text-muted-foreground" dir="ltr">
                              {o.created_at.slice(0, 10)}
                            </span>
                            <span className="text-muted-foreground">{CHANNEL[o.channel] ?? o.channel}</span>
                            <span className="font-bold">{formatIqdLabel(o.total)}</span>
                            <span className="text-muted-foreground">{o.items}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* لا تُحذف ولا تُصدَّر: رقمٌ ناقص بيدُ من كتبه تُصلحه، وحذفه يخسر الزبون */}
      {book.broken.length > 0 && (
        <div className="space-y-2 rounded-2xl border-2 border-destructive/40 bg-destructive/5 p-4">
          <h2 className="flex items-center gap-2 font-black text-destructive">
            <AlertTriangle className="size-5" />
            {book.broken.length} رقماً يحتاج تصحيحاً
          </h2>
          <p className="text-sm font-bold text-muted-foreground">
            كُتبت ناقصة أو خطأً، فلا يُتّصل بها ولا تدخل التصدير. صحّحها هنا وتعود إلى السجلّ.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {book.broken.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-xl border-2 border-border bg-card px-3 py-2">
                <span className="truncate font-bold">{r.name ?? "—"}</span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums text-destructive" dir="ltr">
                    {r.phone ?? "∅"}
                  </span>
                  <button
                    onClick={() => setEdit({ id: r.id, name: r.name ?? "", phone: r.phone ?? "" })}
                    className="text-xs font-black text-primary"
                  >
                    تعديل
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {edit && book.broken.some((b) => b.id === edit.id) && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-primary bg-card p-3">
              <input
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                placeholder="الاسم"
                className="min-w-36 flex-1 rounded-lg border-2 border-border bg-background px-2 py-1.5 font-bold outline-none focus:border-primary"
              />
              <input
                value={edit.phone}
                onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
                dir="ltr"
                placeholder="07XXXXXXXXX"
                className="min-w-36 flex-1 rounded-lg border-2 border-border bg-background px-2 py-1.5 tabular-nums outline-none focus:border-primary"
              />
              <button
                onClick={() => void saveEdit()}
                disabled={busy}
                className="min-h-10 rounded-full bg-primary px-4 text-sm font-black text-primary-foreground disabled:opacity-50"
              >
                حفظ
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
