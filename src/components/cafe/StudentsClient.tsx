"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, GraduationCap, Search, Tag, X } from "lucide-react";
import {
  setStudentPrice,
  setStudentStatus,
  type AdminStudent,
  type StudentPriceRow,
} from "@/lib/cafe/student-actions";
import { formatIqdLabel } from "@/lib/cafe/money";

/**
 * إدارة منيو الطلاب — تبويبان: الطلاب وأسعارهم.
 *
 * وطابور المراجعة أولاً لأنه العمل اليومي: طالبٌ سجّل ينتظر قبولاً، وما
 * قرأته الكاميرا معروضٌ **نصّاً بجانب ما كتبه بيده** — فالمراجع يقارن سطرين
 * ويضغط، ولا يفتح صورة ولا يفكّ خطّاً.
 */

const FIELD = "w-full rounded-lg border-2 border-border bg-card px-2 py-1.5 text-sm font-bold outline-none focus:border-primary";
const STATUS: Record<AdminStudent["status"], { label: string; cls: string }> = {
  pending: { label: "قيد المراجعة", cls: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100" },
  active: { label: "مقبول", cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100" },
  rejected: { label: "مرفوض", cls: "bg-destructive/15 text-destructive" },
};

export function StudentsClient({
  students,
  pricing,
}: {
  students: AdminStudent[];
  pricing: StudentPriceRow[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"students" | "prices">("students");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const pending = students.filter((s) => s.status === "pending");
  const shown = useMemo(() => {
    const n = q.trim();
    if (!n) return students;
    const d = n.replace(/\D/g, "");
    return students.filter(
      (s) => s.name_ar.includes(n) || s.school.includes(n) || s.stage.includes(n) || (d && s.phone.includes(d)),
    );
  }, [students, q]);

  async function decide(id: string, status: AdminStudent["status"]) {
    setBusy(id);
    setMsg(null);
    try {
      const r = await setStudentStatus(id, status);
      setMsg(r.ok ? (status === "active" ? "قُبل الطالب ✅ — ونقاط من دعاه نزلت" : "رُفض") : r.error);
      if (r.ok) router.refresh();
    } catch {
      setMsg("انتهت الجلسة أو لا صلاحية مدير — سجّل الدخول من جديد.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div dir="rtl" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <GraduationCap className="size-6 text-primary" />
            منيو الطلاب
          </h1>
          <p className="text-sm font-bold text-muted-foreground">
            {students.length} طالباً · {students.filter((s) => s.status === "active").length} مقبول
            {pending.length ? ` · ${pending.length} ينتظر المراجعة` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {(["students", "prices"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`min-h-11 rounded-full px-4 text-sm font-black transition ${
                tab === t ? "bg-primary text-primary-foreground" : "border-2 border-border hover:bg-secondary"
              }`}
            >
              {t === "students" ? "الطلاب" : "أسعار الطلاب"}
            </button>
          ))}
        </div>
      </div>

      {msg && <p className="rounded-xl border-2 border-border bg-card px-3 py-2 text-sm font-black">{msg}</p>}

      {tab === "students" ? (
        <>
          {pending.length > 0 && (
            <section className="rounded-2xl border-2 border-amber-500 bg-amber-50 p-3 dark:bg-amber-950/30">
              <p className="text-lg font-black text-amber-900 dark:text-amber-100">
                ينتظرون المراجعة ({pending.length})
              </p>
              <div className="mt-2 space-y-2">
                {pending.map((s) => (
                  <div key={s.id} className="rounded-xl border-2 border-border bg-card p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-base font-black">{s.name_ar}</p>
                        <p className="text-sm font-bold text-muted-foreground">
                          <b>{s.stage}</b> · {s.school}
                          {s.college ? ` · ${s.college}` : ""} · <bdi dir="ltr">{s.phone}</bdi>
                          {s.instagram ? ` · @${s.instagram}` : ""}
                        </p>
                        {s.referred_by_name && (
                          <p className="text-xs font-bold text-primary">دعاه: {s.referred_by_name}</p>
                        )}
                        {/* ما قرأته الكاميرا — نصّاً. ولا صورة محفوظة في أي مكان */}
                        {s.scanned ? (
                          <p className="mt-1 rounded-lg bg-secondary px-2 py-1 text-xs font-black">
                            📇 قرأنا من البطاقة: {s.id_name || "—"}
                            {s.id_school ? ` · ${s.id_school}` : ""}
                          </p>
                        ) : (
                          <p className="mt-1 text-xs font-black text-muted-foreground">📇 ما صوّر بطاقته — راجعه بنفسك</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => void decide(s.id, "active")}
                          disabled={busy === s.id}
                          className="flex min-h-11 items-center gap-1 rounded-xl bg-primary px-4 font-black text-primary-foreground disabled:opacity-50"
                        >
                          <Check className="size-4" /> قبول
                        </button>
                        <button
                          onClick={() => void decide(s.id, "rejected")}
                          disabled={busy === s.id}
                          className="flex min-h-11 items-center gap-1 rounded-xl border-2 border-destructive px-4 font-black text-destructive disabled:opacity-50"
                        >
                          <X className="size-4" /> رفض
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <label className="relative block">
            <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث باسم أو مدرسة أو مرحلة أو رقم…"
              className="w-full rounded-xl border-2 border-border bg-card py-2.5 pe-3 ps-9 text-base font-bold outline-none focus:border-primary"
            />
          </label>

          <div className="overflow-x-auto rounded-2xl border-2 border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-right text-muted-foreground">
                  <th className="py-2 ps-3 font-bold">الطالب</th>
                  <th className="py-2 font-bold">المرحلة والمدرسة</th>
                  <th className="py-2 font-bold">الحالة</th>
                  <th className="py-2 font-bold">نقاطه</th>
                  <th className="py-2 font-bold">دعواته</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 ps-3 font-black">
                      {s.name_ar}
                      <span className="ms-2 font-bold text-muted-foreground"><bdi dir="ltr">{s.phone}</bdi></span>
                    </td>
                    <td className="py-2 font-bold"><b>{s.stage}</b> · {s.school}</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-black ${STATUS[s.status].cls}`}>
                        {STATUS[s.status].label}
                      </span>
                    </td>
                    <td className="py-2 font-bold">{s.points}</td>
                    <td className="py-2 font-bold">{s.invited || "—"}</td>
                    <td className="py-2 pe-3 text-end">
                      {s.status !== "active" ? (
                        <button onClick={() => void decide(s.id, "active")} disabled={busy === s.id} className="text-xs font-black text-primary underline disabled:opacity-50">
                          قبول
                        </button>
                      ) : (
                        <button onClick={() => void decide(s.id, "rejected")} disabled={busy === s.id} className="text-xs font-black text-destructive underline disabled:opacity-50">
                          إيقاف
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!shown.length && (
                  <tr><td colSpan={6} className="py-6 text-center font-bold text-muted-foreground">ما من طالب بعد.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <PriceTab rows={pricing} onSaved={(m) => { setMsg(m); router.refresh(); }} />
      )}
    </div>
  );
}

/**
 * أسعار الطلاب — سعرٌ لكل صنف وسعرٌ لكل حجم.
 *
 * والحجم له خانته الخاصّة عمداً: لو كُتب سعر الطالب للصنف وحده لبقيت **الوجبة**
 * بثمنها الكامل — وهو الافتراض الآمن الذي تحرسه القاعدة. فمن أراد خصم الوجبة
 * يكتبه هنا صراحةً.
 */
function PriceTab({ rows, onSaved }: { rows: StudentPriceRow[]; onSaved: (m: string) => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const shown = rows.filter((r) => !q.trim() || r.name_ar.includes(q.trim()) || r.category_name.includes(q.trim()));

  async function save(row: StudentPriceRow, patch: { studentPrice?: number | null; studentOnly?: boolean; variants?: { id: string; studentPrice: number | null }[] }) {
    setBusy(row.id);
    try {
      const r = await setStudentPrice({ itemId: row.id, ...patch });
      onSaved(r.ok ? `حُفظ «${row.name_ar}» ✅` : r.error);
    } catch {
      onSaved("انتهت الجلسة أو لا صلاحية مدير.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <p className="rounded-xl border-2 border-border bg-card px-3 py-2 text-sm font-bold">
        <Tag className="me-1 inline size-4 text-primary" />
        اكتب سعر الطالب واتركه فارغاً إن ما تريد خصم. و«للطلاب فقط» يخفي الصنف من المنيو العام تماماً.
        <b> والوجبة لها خانتها</b> — بلا سعرٍ لها تبقى بثمنها الكامل.
      </p>
      <label className="relative block">
        <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن صنف…" className="w-full rounded-xl border-2 border-border bg-card py-2.5 pe-3 ps-9 text-base font-bold outline-none focus:border-primary" />
      </label>

      <div className="space-y-2">
        {shown.map((r) => (
          <div key={r.id} className="rounded-2xl border-2 border-border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-black">{r.name_ar}</p>
                <p className="text-xs font-bold text-muted-foreground">
                  {r.category_name} · العادي {formatIqdLabel(r.price)}
                </p>
              </div>
              <label className="flex items-center gap-1.5 text-sm font-black">
                <input
                  type="checkbox"
                  defaultChecked={r.student_only}
                  disabled={busy === r.id}
                  onChange={(e) => void save(r, { studentOnly: e.target.checked })}
                  className="size-4"
                />
                للطلاب فقط
              </label>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-black">سعر الطالب (الأساسي)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  defaultValue={r.student_price ?? ""}
                  disabled={busy === r.id}
                  placeholder="بلا خصم"
                  className={FIELD}
                  onBlur={(e) => {
                    const v = e.target.value.trim() === "" ? null : Number(e.target.value);
                    if (v !== (r.student_price ?? null)) void save(r, { studentPrice: v });
                  }}
                />
              </label>
              {r.variants.map((v) => (
                <label key={v.id} className="space-y-1">
                  <span className="text-xs font-black">سعر الطالب — {v.name_ar} <span className="font-bold text-muted-foreground">(العادي {formatIqdLabel(v.price)})</span></span>
                  <input
                    type="number"
                    inputMode="numeric"
                    defaultValue={v.student_price ?? ""}
                    disabled={busy === r.id}
                    placeholder="بلا خصم"
                    className={FIELD}
                    onBlur={(e) => {
                      const val = e.target.value.trim() === "" ? null : Number(e.target.value);
                      if (val !== (v.student_price ?? null)) void save(r, { variants: [{ id: v.id, studentPrice: val }] });
                    }}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
