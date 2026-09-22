"use client";

import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { submitFranchiseLead } from "@/app/actions/franchise";
import type { SiteCopy, SiteLang } from "@/lib/site/copy";

/**
 * نموذج طلب الوكالة — أربع خانات وزرّ.
 *
 * كل خانة إضافية تخسر مرسِلاً؛ الاسم والمدينة والهاتف يكفون لمكالمة، والباقي
 * يُقال في المكالمة. الخطأ يُعرَض بلغة الصفحة، والنجاح يستبدل النموذج كلّه
 * فلا يُرسل الطلب مرّتين.
 */
export function FranchiseForm({ copy, lang }: { copy: SiteCopy; lang: SiteLang }) {
  const t = copy.form;
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", city: "", phone: "", note: "" });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await submitFranchiseLead({ ...form, lang });
    setBusy(false);
    if (r.ok) {
      setDone(true);
      return;
    }
    setErr(r.error === "name" ? t.errName : r.error === "city" ? t.errCity : r.error === "phone" ? t.errPhone : t.errGeneric);
  }

  if (done) {
    return (
      <p className="rounded-2xl border-2 border-primary bg-primary/10 px-4 py-6 text-center text-base font-black text-primary">
        {t.done}
      </p>
    );
  }

  const field = "w-full rounded-xl border-2 border-border bg-card px-3 py-2.5 text-base font-bold outline-none focus:border-primary";

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-black">
          {t.name}
          <input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" required />
        </label>
        <label className="grid gap-1 text-sm font-black">
          {t.city}
          <input className={field} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required />
        </label>
      </div>
      <label className="grid gap-1 text-sm font-black">
        {t.phone}
        <input
          className={`${field} tabular-nums`}
          dir="ltr"
          inputMode="tel"
          placeholder="07XXXXXXXXX"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          autoComplete="tel"
          required
        />
      </label>
      <label className="grid gap-1 text-sm font-black">
        {t.note}
        <textarea className={`${field} min-h-20`} placeholder={t.notePlaceholder} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      </label>
      {err && <p className="rounded-xl border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm font-black text-destructive">{err}</p>}
      <button
        type="submit"
        disabled={busy}
        className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3.5 text-lg font-black text-primary-foreground shadow-lg transition active:scale-[0.98] disabled:opacity-60"
      >
        <Send className="size-5" />
        {busy ? t.sending : t.submit}
      </button>
    </form>
  );
}
