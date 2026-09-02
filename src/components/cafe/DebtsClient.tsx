"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HandCoins, Wallet } from "lucide-react";
import { addDebtEntry, type Debtor } from "@/lib/cafe/debt-actions";
import { formatIqdLabel } from "@/lib/cafe/money";
import { PriceInput } from "./PriceInput";

export function DebtsClient({ debtors, outstanding }: { debtors: Debtor[]; outstanding: number }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(kind: "debit" | "credit") {
    if (busy) return;
    setMsg(null);
    setBusy(true);
    const res = await addDebtEntry({ customer_name: name, amount, kind, note });
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error);
      return;
    }
    setAmount(0);
    setNote("");
    // keep the name so a quick follow-up on the same customer is easy
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Wallet className="size-6 text-primary" />
          سجل الديون
        </h1>
        <div className="rounded-2xl border-2 border-destructive/40 bg-destructive/5 px-5 py-2 text-center">
          <p className="text-xs text-muted-foreground">إجمالي الديون المستحقة</p>
          <p className="text-2xl font-extrabold tabular-nums text-destructive">{formatIqdLabel(outstanding)}</p>
        </div>
      </div>

      {/* add / settle */}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          list="debtor-names"
          placeholder="اسم العميل"
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring"
        />
        <datalist id="debtor-names">
          {debtors.map((d) => (
            <option key={d.customer_name} value={d.customer_name} />
          ))}
        </datalist>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">المبلغ:</span>
          <PriceInput value={amount} onChange={setAmount} />
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="ملاحظة (اختياري) — مثلاً: طلب اليوم، تسديد جزئي…"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        {msg && <p className="text-sm text-destructive">{msg}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => submit("debit")}
            disabled={busy}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-destructive px-4 py-3 font-bold text-destructive-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            <HandCoins className="size-4" />
            دَيْن على العميل
          </button>
          <button
            onClick={() => submit("credit")}
            disabled={busy}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-success px-4 py-3 font-bold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            💵 تسديد دفعة
          </button>
        </div>
      </div>

      {/* debtors */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">العملاء المدينون</h2>
        {debtors.filter((d) => d.balance !== 0).length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">لا توجد ديون مستحقة.</p>
        ) : (
          debtors
            .filter((d) => d.balance > 0)
            .map((d) => (
              <button
                key={d.customer_name}
                onClick={() => {
                  setName(d.customer_name);
                  setMsg(null);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5 text-right transition hover:border-primary/50"
              >
                <div className="min-w-0">
                  <p className="font-bold">{d.customer_name}</p>
                  <p className="text-xs text-muted-foreground">
                    إجمالي الدين {formatIqdLabel(d.total_debt)} · سُدّد {formatIqdLabel(d.total_paid)}
                  </p>
                </div>
                <div className="shrink-0 text-left">
                  <p className="text-lg font-extrabold tabular-nums text-destructive">{formatIqdLabel(d.balance)}</p>
                  <p className="text-[11px] text-muted-foreground">المتبقّي — اضغط للتسديد</p>
                </div>
              </button>
            ))
        )}
      </div>
    </div>
  );
}
