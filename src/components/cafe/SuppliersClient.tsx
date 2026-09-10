"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Power, Truck } from "lucide-react";
import { saveSupplier, type Supplier } from "@/lib/cafe/expense-actions";

/**
 * شركات المشتريات.
 *
 * دليل أسماء وأرقام لا أكثر: ما يُدفع لها يُسجَّل مصروفاً كما كان دائماً،
 * والجديد أن المصروف صار يعرف لمن دُفع. فلا ذمم هنا ولا تسويات — الدفعة
 * نفسها هي المصروف.
 *
 * ولا حذف: شركة خلفها شهر من المصروفات يجب أن يبقى اسمها مقروءاً في السجل،
 * فالتعطيل يُخرجها من قائمة الكاشير ويُبقيها في التاريخ.
 */
export function SuppliersClient({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone1, setPhone1] = useState("");
  const [phone2, setPhone2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function reset() {
    setEditing(null);
    setAdding(false);
    setName("");
    setPhone1("");
    setPhone2("");
  }

  async function submit() {
    if (busy || !name.trim()) return;
    setBusy(true);
    setMsg(null);
    const res = await saveSupplier({
      id: editing?.id ?? null,
      name: name.trim(),
      phone1: phone1.trim() || null,
      phone2: phone2.trim() || null,
      active: editing ? editing.is_active : true,
    });
    setBusy(false);
    if (!res.ok) return setMsg(res.error);
    reset();
    router.refresh();
  }

  async function toggle(s: Supplier) {
    setBusy(true);
    await saveSupplier({ id: s.id, name: s.name_ar, phone1: s.phone1, phone2: s.phone2, active: !s.is_active });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Truck className="size-6 text-primary" />
          شركات المشتريات
        </h1>
        <button
          onClick={() => {
            setAdding((v) => !v);
            setEditing(null);
            setName("");
            setPhone1("");
            setPhone2("");
          }}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 font-bold text-primary-foreground transition hover:opacity-90"
        >
          <Plus className="size-4" />
          شركة جديدة
        </button>
      </div>

      {msg && <p className="rounded-xl bg-destructive/10 px-4 py-2 text-sm font-bold text-destructive">{msg}</p>}

      {(adding || editing) && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-4">
          <label className="min-w-40 flex-1">
            <span className="mb-1 block text-xs font-bold text-muted-foreground">اسم الشركة</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="بيبسي، طاحونة السنابل، علوة السدة…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="min-w-36 flex-1">
            <span className="mb-1 block text-xs font-bold text-muted-foreground">رقم المندوب</span>
            <input
              value={phone1}
              onChange={(e) => setPhone1(e.target.value)}
              inputMode="tel"
              dir="ltr"
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="min-w-36 flex-1">
            <span className="mb-1 block text-xs font-bold text-muted-foreground">رقم مندوب ثانٍ (اختياري)</span>
            <input
              value={phone2}
              onChange={(e) => setPhone2(e.target.value)}
              inputMode="tel"
              dir="ltr"
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
          <button
            onClick={() => void submit()}
            disabled={busy || !name.trim()}
            className="rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50"
          >
            {editing ? "حفظ" : "إضافة"}
          </button>
          <button onClick={reset} className="rounded-lg border border-border px-4 py-2 font-bold text-muted-foreground">
            إلغاء
          </button>
        </div>
      )}

      {suppliers.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
          لا توجد شركات بعد. أضف شركة لتظهر خياراً عند تسجيل المصروف.
        </p>
      )}

      <div className="space-y-2">
        {suppliers.map((s) => (
          <div
            key={s.id}
            className={`flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 ${
              s.is_active ? "border-border" : "border-dashed border-border opacity-60"
            }`}
          >
            <div className="flex-1">
              <p className="font-bold">
                {s.name_ar}
                {!s.is_active && <span className="mr-2 rounded-full bg-secondary px-2 py-0.5 text-xs font-bold">معطّلة</span>}
              </p>
              <p className="text-xs font-bold text-muted-foreground" dir="ltr">
                {[s.phone1, s.phone2].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
            <button
              onClick={() => {
                setEditing(s);
                setAdding(false);
                setName(s.name_ar);
                setPhone1(s.phone1 ?? "");
                setPhone2(s.phone2 ?? "");
                setMsg(null);
              }}
              className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-bold text-muted-foreground"
            >
              <Pencil className="size-3.5" />
              تعديل
            </button>
            <button
              onClick={() => void toggle(s)}
              title={s.is_active ? "تعطيل" : "تفعيل"}
              className="rounded-lg border border-border p-2 text-muted-foreground transition hover:bg-secondary"
            >
              <Power className="size-4" />
            </button>
          </div>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        💡 عند تسجيل مصروف تُختار الشركة من قائمة، ويُقبل المصروف بلا شركة أيضاً. الشركة المعطَّلة تختفي من قائمة الكاشير وتبقى في المصروفات القديمة.
      </p>
    </div>
  );
}
