"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Camera, Heart, Loader2, ShieldCheck } from "lucide-react";
import { registerStudent } from "@/lib/cafe/student-actions";
import { classLabel, isMinorStage, schoolLabel, STAGES, studentFormError } from "@/lib/cafe/student";

/**
 * «ستيشن مع الطالب» — التسجيل.
 *
 * هذه ليست صفحة خصم، هي صفحة برنامجٍ لدعم الطالب من الابتدائية إلى الجامعة.
 * والفرق بينهما في النبرة قبل الشيفرة: لا كلمة «خصم» في العنوان، ولا نسبة
 * كبيرة تُصرخ بها — بل ما نقدّمه، ولمن، ولماذا.
 *
 * **والمرحلة تُسأل أولاً وتُبدّل ما بعدها:** تلميذ الابتدائية ليس عنده هاتف
 * ولا هوية جامعية، وأهله هم من يطلب له. فيُسأل عن هاتف وليّه، ولا تُطلب منه
 * بطاقة — ولا يُعرَض على طفلٍ أن يصوّر هويته أصلاً.
 */

const FIELD =
  "w-full rounded-xl border-2 border-border bg-card px-3 py-2.5 text-base font-bold outline-none focus:border-primary";

export function StudentJoinClient({ refCode }: { refCode: string | null }) {
  const router = useRouter();
  const [stage, setStage] = useState<string>("جامعة");
  const [name, setName] = useState("");
  const [school, setSchool] = useState("");
  const [cls, setCls] = useState("");
  const [phone, setPhone] = useState("");
  const [instagram, setInstagram] = useState("");

  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<{ name: string; school: string; studentNo: string } | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const minor = isMinorStage(stage);

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
      setScanned({ name: j.name ?? "", school: j.university ?? "", studentNo: j.studentNo ?? "" });
      if (j.name && !name.trim()) setName(j.name);
      if (j.university && !school.trim()) setSchool(j.university);
      if (j.college && !cls.trim()) setCls(j.college);
      setScanNote("قرأنا البطاقة ✅ — راجع الحقول وصحّحها إذا لزم.");
    } catch {
      setScanNote("ما قدرنا نقرأ البطاقة — كمّل التسجيل عادي.");
    } finally {
      setScanning(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const bad = studentFormError({ name, school, phone, stage });
    if (bad) return setErr(bad);
    setBusy(true);
    setErr(null);
    try {
      const r = await registerStudent({
        name, school, phone, stage,
        college: cls || null,
        instagram: instagram || null,
        idNumber: scanned?.studentNo || null,
        idName: scanned?.name || null,
        idSchool: scanned?.school || null,
        ref: refCode,
      });
      if (!r.ok) return setErr(r.error);
      try {
        localStorage.setItem("st-student-token", r.token);
      } catch {
        /* تصفّح خاص — الرابط وحده يكفي */
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
      {/* ── الهوية: برنامج دعم، لا قسيمة خصم ───────────────────── */}
      <header className="rounded-3xl border-2 border-primary/30 bg-secondary p-5 text-center">
        <BookOpen className="mx-auto size-10 text-primary" />
        <h1 className="mt-2 text-2xl font-black">ستيشن مع الطالب</h1>
        <p className="mt-1 text-sm font-bold leading-relaxed text-muted-foreground">
          برنامج لدعم طلبة الأنبار — <b>من الابتدائية إلى الجامعة</b>.
          <br />
          لأن الدراسة تتعب، والأكل الطيب جزء من يومك.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] font-black">
          <div className="rounded-xl bg-card px-2 py-2">أسعار خاصّة للطالب</div>
          <div className="rounded-xl bg-card px-2 py-2">أصناف تخصّكم</div>
          <div className="rounded-xl bg-card px-2 py-2">نقاط تتجمّع لك</div>
        </div>
        {refCode && (
          <p className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2 text-sm font-black text-primary">
            <Heart className="size-4" />
            دعاك زميلك — سجّل وخلّيه يربح نقاطه
          </p>
        )}
      </header>

      <form onSubmit={onSubmit} className="space-y-4">
        {/* ── المرحلة أولاً: هي التي تبدّل كل ما بعدها ───────────── */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-black">المرحلة الدراسية</legend>
          <div className="grid grid-cols-3 gap-2">
            {STAGES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStage(s.id)}
                className={`min-h-16 rounded-xl border-2 px-2 text-center transition ${
                  stage === s.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-secondary"
                }`}
              >
                <span className="block text-sm font-black">{s.label}</span>
                <span className="block text-[10px] font-bold opacity-80">{s.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block space-y-1">
          <span className="text-sm font-black">{minor ? "اسم التلميذ" : "الاسم الكامل"}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={FIELD} placeholder="الاسم الثلاثي" />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-black">اسم {schoolLabel(stage)}</span>
          <input
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            className={FIELD}
            placeholder={stage === "جامعة" ? "جامعة الأنبار" : "مثلاً: ثانوية الرمادي للبنين"}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-black">
            {classLabel(stage)} <span className="font-bold text-muted-foreground">(اختياري)</span>
          </span>
          <input
            value={cls}
            onChange={(e) => setCls(e.target.value)}
            className={FIELD}
            placeholder={stage === "جامعة" ? "كلية الهندسة" : "الخامس العلمي"}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-black">{minor ? "هاتف ولي الأمر" : "رقم الهاتف"}</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={FIELD}
            placeholder="07XXXXXXXXX"
            inputMode="tel"
            dir="ltr"
          />
          {minor && (
            <span className="block text-[11px] font-bold text-muted-foreground">
              التلميذ ما عنده هاتف غالباً — والطلب يوصل على هاتف الأهل.
            </span>
          )}
        </label>

        {/* ── قارئ البطاقة: للكبار وحدهم، ولا صورة تُحفظ ────────── */}
        {!minor && (
          <div className="rounded-2xl border-2 border-primary/40 bg-secondary p-3">
            <p className="flex items-center gap-1.5 text-base font-black">
              <ShieldCheck className="size-4 text-primary" />
              صوّر هويتك الدراسية
            </p>
            <p className="mt-1 text-xs font-bold leading-relaxed text-muted-foreground">
              نقرأ منها <b>الاسم واسم {schoolLabel(stage)} ورقمك</b> فقط — <b>ولا نحتفظ بالصورة إطلاقاً</b>.
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
        )}

        {!minor && (
          <label className="block space-y-1">
            <span className="text-sm font-black">
              إنستغرام <span className="font-bold text-muted-foreground">(اختياري)</span>
            </span>
            <input value={instagram} onChange={(e) => setInstagram(e.target.value)} className={FIELD} placeholder="@username" dir="ltr" />
          </label>
        )}

        {err && (
          <p className="rounded-xl border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm font-black text-destructive">{err}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="min-h-14 w-full rounded-2xl bg-primary text-lg font-black text-primary-foreground disabled:opacity-50"
        >
          {busy ? "جارٍ التسجيل…" : "سجّلني بالبرنامج"}
        </button>
        <p className="text-center text-xs font-bold leading-relaxed text-muted-foreground">
          تراجع الإدارة الطلب، ويوصلك الرد. وبياناتك تبقى عندنا ولا تُشارَك مع أحد.
        </p>
      </form>
    </main>
  );
}
