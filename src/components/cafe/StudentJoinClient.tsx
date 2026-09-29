"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Camera, Check, GraduationCap, Heart, Loader2, ShieldCheck } from "lucide-react";
import { registerStudent } from "@/lib/cafe/student-actions";
import { classLabel, isMinorStage, schoolLabel, STAGES, studentFormError } from "@/lib/cafe/student";

/**
 * تسجيل الطالب — خطوتان لا استمارة طويلة.
 *
 * الأولى: من أنت (المرحلة). والثانية: بياناتك. والفصل ليس زينة — المرحلة
 * تبدّل كل حقلٍ بعدها، فسؤالها أولاً يجعل الخطوة الثانية مكتوبةً لصاحبها:
 * تلميذ الابتدائية يُسأل عن مدرسته وصفّه وهاتف وليّه، والجامعيّ عن جامعته
 * وكلّيته وهاتفه هو.
 *
 * واستمارةٌ واحدة طويلة تُخيف على الهاتف، وخطوتان قصيرتان تُكمَلان.
 *
 * **ولا يُعرَض على طفلٍ أن يصوّر هويته** — قارئ البطاقة يظهر للإعدادية فما
 * فوق، ولا يُخزَّن ما يقرؤه صورةً في أي حال.
 */

const FIELD =
  "w-full rounded-2xl border-2 border-border bg-card px-4 py-3 text-base font-bold outline-none transition focus:border-primary";

export function StudentJoinClient({ refCode }: { refCode: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
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
        setScanNote("ما قدرنا نقرأ البطاقة — كمّل وراح نراجعها بأنفسنا.");
        return;
      }
      setScanned({ name: j.name ?? "", school: j.university ?? "", studentNo: j.studentNo ?? "" });
      if (j.name && !name.trim()) setName(j.name);
      if (j.university && !school.trim()) setSchool(j.university);
      if (j.college && !cls.trim()) setCls(j.college);
      setScanNote("قرأنا البطاقة — راجع الحقول وصحّحها إذا لزم.");
    } catch {
      setScanNote("ما قدرنا نقرأ البطاقة — كمّل عادي.");
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
    <main dir="rtl" className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-8 pt-6">
      {/* ── الترويسة وخطوتاها ─────────────────────────────────── */}
      <header className="mb-5">
        <Link href="/student" className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-muted-foreground">
          <ArrowRight className="size-4" />
          رجوع
        </Link>
        <div className="flex items-center gap-3">
          <GraduationCap className="size-8 shrink-0 text-primary" />
          <div>
            <h1 className="text-xl font-black leading-tight">التسجيل بالبرنامج</h1>
            <p className="text-xs font-bold text-muted-foreground">
              {step === 1 ? "الخطوة ١ من ٢ — مرحلتك الدراسية" : "الخطوة ٢ من ٢ — بياناتك"}
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-1.5">
          <span className="h-1.5 flex-1 rounded-full bg-primary" />
          <span className={`h-1.5 flex-1 rounded-full ${step === 2 ? "bg-primary" : "bg-border"}`} />
        </div>
        {refCode && (
          <p className="mt-3 flex items-center gap-1.5 rounded-2xl bg-primary/10 px-3 py-2 text-sm font-black text-primary">
            <Heart className="size-4 shrink-0" />
            دعاك زميلك — سجّل وخلّيه يربح نقاطه
          </p>
        )}
      </header>

      {step === 1 ? (
        <>
          <div className="grid gap-2.5">
            {STAGES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => { setStage(s.id); setStep(2); }}
                className={`flex min-h-16 items-center justify-between rounded-2xl border-2 px-4 text-right transition active:scale-[0.99] ${
                  stage === s.id ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-secondary"
                }`}
              >
                <span>
                  <span className="block text-lg font-black">{s.label}</span>
                  <span className="block text-xs font-bold text-muted-foreground">{s.hint}</span>
                </span>
                <span className={`flex size-7 items-center justify-center rounded-full border-2 ${stage === s.id ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                  {stage === s.id && <Check className="size-4" />}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-4 text-center text-xs font-bold text-muted-foreground">
            اختر مرحلتك وننتقل للخطوة الثانية
          </p>
        </>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-4">
          <button
            type="button"
            onClick={() => setStep(1)}
            className="flex items-center justify-between rounded-2xl border-2 border-border bg-secondary px-4 py-2.5 text-right"
          >
            <span>
              <span className="block text-[11px] font-bold text-muted-foreground">المرحلة</span>
              <span className="block text-base font-black">{stage}</span>
            </span>
            <span className="text-xs font-black text-primary">تغيير</span>
          </button>

          <label className="block space-y-1.5">
            <span className="text-sm font-black">{minor ? "اسم التلميذ" : "الاسم الكامل"}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={FIELD} placeholder="الاسم الثلاثي" />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-black">اسم {schoolLabel(stage)}</span>
            <input
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              className={FIELD}
              placeholder={stage === "جامعة" ? "جامعة الأنبار" : "ثانوية الرمادي للبنين"}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="text-sm font-black">{classLabel(stage)}</span>
              <input
                value={cls}
                onChange={(e) => setCls(e.target.value)}
                className={FIELD}
                placeholder={stage === "جامعة" ? "الهندسة" : "السادس العلمي"}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-black">{minor ? "هاتف الأهل" : "رقم الهاتف"}</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={FIELD}
                placeholder="07XXXXXXXXX"
                inputMode="tel"
                dir="ltr"
              />
            </label>
          </div>
          {minor && (
            <p className="-mt-2 text-[11px] font-bold text-muted-foreground">
              التلميذ ما عنده هاتف غالباً — والطلب يوصل على هاتف الأهل.
            </p>
          )}

          {!minor && (
            <>
              <div className="rounded-2xl border-2 border-primary/40 bg-secondary p-3">
                <p className="flex items-center gap-1.5 text-base font-black">
                  <ShieldCheck className="size-4 shrink-0 text-primary" />
                  صوّر هويتك الدراسية
                  <span className="ms-auto rounded-full bg-card px-2 py-0.5 text-[10px] font-black text-muted-foreground">اختياري</span>
                </p>
                <p className="mt-1 text-xs font-bold leading-relaxed text-muted-foreground">
                  نقرأ منها الاسم و{schoolLabel(stage)} ورقمك فقط — <b className="text-foreground">ولا نحتفظ بالصورة إطلاقاً</b>.
                </p>
                <label className={`mt-2.5 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed font-black transition ${scanned ? "border-primary bg-primary/10 text-primary" : "border-primary bg-card text-primary"}`}>
                  {scanning ? <Loader2 className="size-5 animate-spin" /> : scanned ? <Check className="size-5" /> : <Camera className="size-5" />}
                  {scanning ? "جارٍ القراءة…" : scanned ? "قُرئت — صوّرها من جديد؟" : "افتح الكاميرا"}
                  <input type="file" accept="image/*" capture="environment" className="hidden" disabled={scanning} onChange={(e) => void onPick(e.target.files?.[0] ?? null)} />
                </label>
                {scanNote && <p className="mt-2 text-xs font-black">{scanNote}</p>}
              </div>

              <label className="block space-y-1.5">
                <span className="text-sm font-black">
                  إنستغرام <span className="font-bold text-muted-foreground">(اختياري)</span>
                </span>
                <input value={instagram} onChange={(e) => setInstagram(e.target.value)} className={FIELD} placeholder="@username" dir="ltr" />
              </label>
            </>
          )}

          {err && (
            <p className="rounded-2xl border-2 border-destructive bg-destructive/10 px-3 py-2.5 text-sm font-black text-destructive">{err}</p>
          )}

          <div className="mt-auto space-y-2 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="min-h-14 w-full rounded-2xl bg-primary text-lg font-black text-primary-foreground shadow-lg transition active:scale-[0.99] disabled:opacity-50"
            >
              {busy ? "جارٍ التسجيل…" : "سجّلني بالبرنامج"}
            </button>
            <p className="text-center text-[11px] font-bold leading-relaxed text-muted-foreground">
              تراجع الإدارة الطلب ويوصلك الرد. وبياناتك تبقى عندنا ولا تُشارَك مع أحد.
            </p>
          </div>
        </form>
      )}
    </main>
  );
}
