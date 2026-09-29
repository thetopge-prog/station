"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Camera, GraduationCap, Loader2, ShieldCheck } from "lucide-react";
import { registerStudent } from "@/lib/cafe/student-actions";
import { studentFormError, UNIVERSITIES } from "@/lib/cafe/student";

/**
 * تسجيل الطالب.
 *
 * والبطاقة تُقرأ ولا تُحفظ — وهذا مكتوبٌ على الشاشة للطالب بصريح العبارة،
 * لأن من يُطلب منه تصوير هويته يستحقّ أن يعرف أين تذهب. والشيفرة تفعل ما
 * تقوله الشاشة: الصورة تُرسَل، تُقرأ، ولا تُخزَّن.
 *
 * والقراءة اختيارية لا شرط: يقدر يكمل بلا تصوير، وتقبله الإدارة بنظرها.
 * فهاتفٌ بكاميرا ضعيفة أو ضوءٌ رديء لا يقف في وجه تسجيلٍ صحيح.
 */

const FIELD =
  "w-full rounded-xl border-2 border-border bg-card px-3 py-2.5 text-base font-bold outline-none focus:border-primary";

export function StudentJoinClient({ refCode }: { refCode: string | null }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [university, setUniversity] = useState<string>(UNIVERSITIES[0]);
  const [college, setCollege] = useState("");
  const [phone, setPhone] = useState("");
  const [instagram, setInstagram] = useState("");

  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<{ name: string; university: string; studentNo: string } | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onPick(file: File | null) {
    if (!file) return;
    setScanning(true);
    setScanNote(null);
    try {
      const body = new FormData();
      body.append("image", file);
      const res = await fetch("/api/student/scan", { method: "POST", body });
      const j = (await res.json()) as {
        ok: boolean; name?: string; university?: string; college?: string; studentNo?: string;
      };
      if (!j.ok) {
        setScanNote("ما قدرنا نقرأ البطاقة — كمّل التسجيل وراح نراجعها بأنفسنا.");
        return;
      }
      setScanned({ name: j.name ?? "", university: j.university ?? "", studentNo: j.studentNo ?? "" });
      // ما قرأته الكاميرا يملأ الفراغ ولا يمسح ما كتبه الطالب بيده
      if (j.name && !name.trim()) setName(j.name);
      if (j.college && !college.trim()) setCollege(j.college);
      setScanNote("قرأنا البطاقة ✅ — راجع الحقول وصحّحها إذا لزم.");
    } catch {
      setScanNote("ما قدرنا نقرأ البطاقة — كمّل التسجيل عادي.");
    } finally {
      setScanning(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const bad = studentFormError({ name, university, phone });
    if (bad) return setErr(bad);
    setBusy(true);
    setErr(null);
    try {
      const r = await registerStudent({
        name, university, phone,
        college: college || null,
        instagram: instagram || null,
        idNumber: scanned?.studentNo || null,
        idName: scanned?.name || null,
        idUniversity: scanned?.university || null,
        ref: refCode,
      });
      if (!r.ok) return setErr(r.error);
      try {
        localStorage.setItem("st-student-token", r.token);
      } catch {
        /* وضع التصفّح الخاص — الرابط وحده يكفي */
      }
      router.replace(`/student/${r.token}`);
    } catch {
      setErr("تعذّر الإرسال — تأكد من الإنترنت وحاول ثانيةً.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main dir="rtl" className="mx-auto w-full max-w-md space-y-5 p-5">
      <div className="text-center">
        <GraduationCap className="mx-auto size-12 text-primary" />
        <h1 className="mt-2 text-2xl font-black">منيو الطلاب</h1>
        <p className="mt-1 text-sm font-bold text-muted-foreground">
          أسعار خاصّة وأصناف ما تلكاها بالمنيو العادي
        </p>
        {refCode && (
          <p className="mt-2 rounded-xl bg-secondary px-3 py-2 text-sm font-black text-primary">
            دعاك زميلك 🎓 — سجّل وخلّيه يربح نقاطه
          </p>
        )}
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {/* ── قارئ البطاقة ─────────────────────────────────────── */}
        <div className="rounded-2xl border-2 border-primary/40 bg-secondary p-3">
          <p className="flex items-center gap-1.5 text-base font-black">
            <ShieldCheck className="size-4 text-primary" />
            صوّر هويتك الجامعية
          </p>
          <p className="mt-1 text-xs font-bold leading-relaxed text-muted-foreground">
            نقرأ منها <b>الاسم والجامعة ورقمك</b> فقط — <b>ولا نحتفظ بالصورة إطلاقاً</b>.
            وهي اختيارية: تكدر تكمّل بدونها وتراجعها الإدارة.
          </p>
          <label className="mt-2 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-card font-black text-primary">
            {scanning ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
            {scanning ? "جارٍ القراءة…" : scanned ? "صوّرها من جديد" : "افتح الكاميرا"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={scanning}
              onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
            />
          </label>
          {scanNote && <p className="mt-2 text-xs font-black">{scanNote}</p>}
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-black">الاسم الكامل</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={FIELD} placeholder="أحمد علي" />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-black">الجامعة</span>
          <select value={university} onChange={(e) => setUniversity(e.target.value)} className={FIELD}>
            {UNIVERSITIES.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-black">الكلية <span className="font-bold text-muted-foreground">(اختياري)</span></span>
          <input value={college} onChange={(e) => setCollege(e.target.value)} className={FIELD} placeholder="كلية الهندسة" />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-black">رقم الهاتف</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={FIELD}
            placeholder="07XXXXXXXXX"
            inputMode="tel"
            dir="ltr"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-black">إنستغرام <span className="font-bold text-muted-foreground">(اختياري)</span></span>
          <input value={instagram} onChange={(e) => setInstagram(e.target.value)} className={FIELD} placeholder="@username" dir="ltr" />
        </label>

        {err && <p className="rounded-xl border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm font-black text-destructive">{err}</p>}

        <button
          type="submit"
          disabled={busy}
          className="min-h-14 w-full rounded-2xl bg-primary text-lg font-black text-primary-foreground disabled:opacity-50"
        >
          {busy ? "جارٍ التسجيل…" : "سجّلني"}
        </button>
        <p className="text-center text-xs font-bold text-muted-foreground">
          بعد التسجيل تراجع الإدارة طلبك، وتوصلك أسعار الطلاب أول ما يُقبل.
        </p>
      </form>
    </main>
  );
}
