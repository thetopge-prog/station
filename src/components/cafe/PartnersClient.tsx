"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Bike, ChevronDown, HandCoins, Plus, Power } from "lucide-react";
import {
  partnerLedger,
  partnerOrderItems,
  savePartner,
  settlePartner,
  type LedgerRow,
  type PartnerBalance,
} from "@/lib/cafe/partner-actions";
import { formatIqdLabel } from "@/lib/cafe/money";
import { PriceInput } from "./PriceInput";

/**
 * حسابات شركات التوصيل — what each aggregator owes and what they have paid.
 *
 * One company is open at a time. A statement is something you read in one
 * column and follow downwards; six of them side by side is a spreadsheet, and
 * a spreadsheet is what this exists to replace.
 */

const TODAY = () => new Date().toISOString().slice(0, 10);

type OrderItem = { name_ar: string; flavor_ar: string | null; qty: number; line_total: number };

export function PartnersClient({ partners }: { partners: PartnerBalance[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // one order's lines, fetched on demand — a company with 400 orders in a
  // month should not ship 400 item lists nobody opened
  const [items, setItems] = useState<Record<string, OrderItem[]>>({});
  const [openOrder, setOpenOrder] = useState<string | null>(null);

  // add / edit
  const [editing, setEditing] = useState<PartnerBalance | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [adding, setAdding] = useState(false);

  // settle
  const [settleFor, setSettleFor] = useState<PartnerBalance | null>(null);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<"transfer" | "cash" | "other">("transfer");
  const [note, setNote] = useState("");

  const outstanding = partners.reduce((s, p) => s + Math.max(0, p.balance), 0);

  async function load(id: string, f = from, t = to) {
    setBusy(true);
    setRows(await partnerLedger(id, f || null, t || null));
    setBusy(false);
  }

  async function toggleOpen(p: PartnerBalance) {
    if (open === p.id) {
      setOpen(null);
      return;
    }
    setOpen(p.id);
    setRows([]);
    await load(p.id);
  }

  async function toggleOrder(row: LedgerRow) {
    if (row.kind !== "order") return;
    if (openOrder === row.ref) {
      setOpenOrder(null);
      return;
    }
    setOpenOrder(row.ref);
    if (!items[row.ref]) {
      const lines = await partnerOrderItems(row.ref);
      setItems((m) => ({ ...m, [row.ref]: lines }));
    }
  }

  async function submitPartner() {
    if (busy || !name.trim()) return;
    setBusy(true);
    setMsg(null);
    const res = await savePartner({
      id: editing?.id ?? null,
      name: name.trim(),
      phone: phone.trim() || null,
      active: editing ? editing.is_active : true,
    });
    setBusy(false);
    if (!res.ok) return setMsg(res.error);
    setName("");
    setPhone("");
    setEditing(null);
    setAdding(false);
    router.refresh();
  }

  async function toggleActive(p: PartnerBalance) {
    setBusy(true);
    // never deleted — a company with orders behind them has to keep resolving
    // on old receipts and in old reports
    await savePartner({ id: p.id, name: p.name_ar, phone: p.phone, active: !p.is_active });
    setBusy(false);
    router.refresh();
  }

  async function submitSettlement() {
    if (busy || !settleFor) return;
    setBusy(true);
    setMsg(null);
    const res = await settlePartner({ partnerId: settleFor.id, amount, method, note: note.trim() || null });
    setBusy(false);
    if (!res.ok) return setMsg(res.error);
    setSettleFor(null);
    setAmount(0);
    setNote("");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Bike className="size-6 text-primary" />
          شركات التوصيل
        </h1>
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-border bg-card px-4 py-2 text-center">
            <p className="text-xs font-bold text-muted-foreground">إجمالي المستحق لنا</p>
            <p className="text-xl font-black tabular-nums text-primary">{formatIqdLabel(outstanding)}</p>
          </div>
          <button
            onClick={() => {
              setAdding((v) => !v);
              setEditing(null);
              setName("");
              setPhone("");
            }}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 font-bold text-primary-foreground transition hover:opacity-90"
          >
            <Plus className="size-4" />
            شركة جديدة
          </button>
        </div>
      </div>

      {msg && <p className="rounded-xl bg-destructive/10 px-4 py-2 text-sm font-bold text-destructive">{msg}</p>}

      {(adding || editing) && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-4">
          <label className="flex-1 min-w-40">
            <span className="mb-1 block text-xs font-bold text-muted-foreground">اسم الشركة</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="طلبات، توترز، زاد…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="flex-1 min-w-40">
            <span className="mb-1 block text-xs font-bold text-muted-foreground">هاتف المندوب (اختياري)</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
          <button
            onClick={submitPartner}
            disabled={busy || !name.trim()}
            className="rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50"
          >
            {editing ? "حفظ" : "إضافة"}
          </button>
          <button
            onClick={() => {
              setAdding(false);
              setEditing(null);
            }}
            className="rounded-lg border border-border px-4 py-2 font-bold text-muted-foreground"
          >
            إلغاء
          </button>
        </div>
      )}

      {partners.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
          لا توجد شركات توصيل بعد. أضف شركة لتظهر كطريقة دفع «بالآجل» في الكاشير.
        </p>
      )}

      <div className="space-y-2">
        {partners.map((p) => (
          <div key={p.id} className={`rounded-2xl border bg-card ${p.is_active ? "border-border" : "border-dashed border-border opacity-60"}`}>
            <div className="flex flex-wrap items-center gap-3 p-4">
              <button onClick={() => void toggleOpen(p)} className="flex flex-1 items-center gap-2 text-right">
                <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition ${open === p.id ? "rotate-180" : ""}`} />
                <span className="font-bold">{p.name_ar}</span>
                {!p.is_active && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-bold">معطّلة</span>}
                <span className="text-xs text-muted-foreground">{p.orders_count} طلب</span>
              </button>

              <div className="text-left">
                <p className="text-xs font-bold text-muted-foreground">الرصيد المستحق</p>
                <p className={`text-lg font-black tabular-nums ${p.balance > 0 ? "text-primary" : "text-muted-foreground"}`}>
                  {formatIqdLabel(p.balance)}
                </p>
              </div>

              <button
                onClick={() => {
                  setSettleFor(p);
                  // pre-filled with the full balance: the common case is a
                  // transfer that clears the account
                  setAmount(Math.max(0, p.balance));
                  setMsg(null);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-sm font-bold transition hover:bg-secondary/70"
              >
                <HandCoins className="size-4" />
                تسوية الحساب
              </button>
              <button
                onClick={() => {
                  setEditing(p);
                  setAdding(false);
                  setName(p.name_ar);
                  setPhone(p.phone ?? "");
                }}
                className="rounded-lg border border-border px-3 py-2 text-sm font-bold text-muted-foreground"
              >
                تعديل
              </button>
              <button
                onClick={() => void toggleActive(p)}
                title={p.is_active ? "تعطيل" : "تفعيل"}
                className="rounded-lg border border-border p-2 text-muted-foreground transition hover:bg-secondary"
              >
                <Power className="size-4" />
              </button>
            </div>

            {open === p.id && (
              <div className="border-t border-border p-4">
                <div className="mb-3 flex flex-wrap items-end gap-2">
                  <label>
                    <span className="mb-1 block text-xs font-bold text-muted-foreground">من</span>
                    <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-1.5" />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-bold text-muted-foreground">إلى</span>
                    <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-1.5" />
                  </label>
                  <button onClick={() => void load(p.id)} className="rounded-lg bg-secondary px-3 py-1.5 text-sm font-bold">
                    عرض
                  </button>
                  <button
                    onClick={() => {
                      setFrom("");
                      setTo("");
                      void load(p.id, "", "");
                    }}
                    className="rounded-lg px-3 py-1.5 text-sm font-bold text-muted-foreground"
                  >
                    الكل
                  </button>
                  <button
                    onClick={() => {
                      const t = TODAY();
                      setFrom(t);
                      setTo(t);
                      void load(p.id, t, t);
                    }}
                    className="rounded-lg px-3 py-1.5 text-sm font-bold text-muted-foreground"
                  >
                    اليوم
                  </button>
                </div>

                {busy && <p className="py-4 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>}
                {!busy && rows.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">لا توجد حركات في هذه الفترة.</p>
                )}

                {rows.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-xs text-muted-foreground">
                        <tr>
                          <th className="p-2 text-right font-bold">الحركة</th>
                          <th className="p-2 text-right font-bold">التاريخ</th>
                          <th className="p-2 text-left font-bold">المبلغ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <Fragment key={r.ref}>
                            <tr
                              className={`border-t border-border ${r.kind === "order" ? "cursor-pointer hover:bg-secondary/40" : ""}`}
                              onClick={() => void toggleOrder(r)}
                            >
                              <td className="p-2 font-bold">
                                {r.kind === "settlement" ? "💰 " : ""}
                                {r.label}
                                {r.kind === "order" && (
                                  <span className="mr-1 text-xs font-normal text-muted-foreground">
                                    {openOrder === r.ref ? "▲" : "▼"}
                                  </span>
                                )}
                              </td>
                              <td className="p-2 tabular-nums text-muted-foreground">
                                {new Date(r.at).toLocaleString("ar-IQ", { dateStyle: "short", timeStyle: "short" })}
                              </td>
                              {/* negative = money received, and it reads as a
                                  subtraction because that is what it does */}
                              <td className={`p-2 text-left font-black tabular-nums ${r.amount < 0 ? "text-success" : ""}`}>
                                {r.amount < 0 ? "− " : ""}
                                {formatIqdLabel(Math.abs(r.amount))}
                              </td>
                            </tr>
                            {openOrder === r.ref && (
                              <tr className="bg-secondary/30">
                                <td colSpan={3} className="px-6 py-2">
                                  {!items[r.ref] && <span className="text-xs text-muted-foreground">جارٍ التحميل…</span>}
                                  <ul className="space-y-0.5 text-xs">
                                    {(items[r.ref] ?? []).map((it, i) => (
                                      <li key={i} className="flex justify-between gap-3">
                                        <span>
                                          {it.qty} × {it.name_ar}
                                          {it.flavor_ar ? ` — ${it.flavor_ar}` : ""}
                                        </span>
                                        <span className="tabular-nums">{formatIqdLabel(it.line_total)}</span>
                                      </li>
                                    ))}
                                  </ul>
                                  <p className="mt-1 text-[10px] text-muted-foreground" dir="ltr">
                                    {r.ref}
                                  </p>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border">
                          <td className="p-2 font-black" colSpan={2}>
                            صافي الفترة
                          </td>
                          <td className="p-2 text-left font-black tabular-nums">
                            {formatIqdLabel(rows.reduce((s, r) => s + r.amount, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {settleFor && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setSettleFor(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-lg font-black">تسوية حساب {settleFor.name_ar}</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              المستحق حالياً: <b className="tabular-nums">{formatIqdLabel(settleFor.balance)}</b>
            </p>

            <span className="mb-1 block text-xs font-bold text-muted-foreground">المبلغ المستلم</span>
            <PriceInput value={amount} onChange={setAmount} />

            <div className="my-3 grid grid-cols-3 gap-1.5 rounded-xl bg-secondary/60 p-1.5">
              {([["transfer", "حوالة"], ["cash", "نقداً"], ["other", "أخرى"]] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setMethod(k)}
                  className={`rounded-lg px-2 py-2 text-sm font-bold transition ${method === k ? "bg-primary text-primary-foreground" : "hover:bg-background"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ملاحظة (رقم الحوالة، الفترة…)"
              className="mb-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />

            <div className="flex gap-2">
              <button
                onClick={submitSettlement}
                disabled={busy || amount <= 0}
                className="flex-1 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground disabled:opacity-50"
              >
                تسجيل التسوية
              </button>
              <button onClick={() => setSettleFor(null)} className="rounded-xl border border-border px-4 py-3 font-bold text-muted-foreground">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
