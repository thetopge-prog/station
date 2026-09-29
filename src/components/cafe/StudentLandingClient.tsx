"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, GraduationCap, IdCard, Sparkles, Ticket, UsersRound } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { STAGES } from "@/lib/cafe/student";
import type { Shot } from "./OrderLandingClient";

/**
 * «ستيشن مع الطالب» — الصفحة التي يُعلَن عنها.
 *
 * وهي أول ما يُلصَق على جدار كلّية أو يُرسَل في مجموعة صفّ، فلا تكفيها
 * استمارة. بُنيت بلغة `/order` نفسها — شريطا طعامٍ ينسابان خلف المحتوى،
 * وهرمٌ واضح من زرٍّ واحد كبير — لأن تلك الشاشة مجرَّبة على زبائن المحل
 * وتعمل، وصفحةٌ تشبهها تبدو من البيت نفسه لا من بيتٍ آخر.
 *
 * والمراحل معروضة لا مذكورة: «من الابتدائية إلى الجامعة» جملةٌ تُقرأ وتُنسى،
 * وخمس بطاقاتٍ فيها اسم كل مرحلة تُري التلميذ نفسه في الصفحة.
 *
 * وكل الحركة CSS — لا مكتبة ولا مؤقّت، و«تقليل الحركة» يوقفها من القاعدة
 * العامّة في globals.css.
 */

export function StudentLandingClient({ shots }: { shots: Shot[] }) {
  const half = Math.ceil(shots.length / 2);
  const top = shots.slice(0, half);
  const bottom = shots.length > half ? shots.slice(half) : [...top].reverse();

  // من سجّل سابقاً على هذا الجهاز يرجع إلى بطاقته بضغطة، لا يسجّل مرّتين
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    // في مؤقّتٍ لا في جسم الأثر: React 19 يرفض setState متزامناً داخله، وهي
    // نفس القاعدة التي اضطرّت `LateDrawerNotice` إلى هذا الشكل
    const id = setTimeout(() => {
      try {
        setToken(localStorage.getItem("st-student-token"));
      } catch {
        /* تصفّح خاص */
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);

  return (
    <main dir="rtl" className="relative flex min-h-dvh flex-col items-center justify-between overflow-hidden bg-background">
      <Strip items={top} reverse={false} />

      <section className="relative z-10 flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-5 px-5 py-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt={BRAND.nameAr}
          width={512}
          height={512}
          className="h-auto w-24 drop-shadow-[0_6px_22px_rgba(255,107,0,0.35)] sm:w-28"
        />

        <div className="text-center">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary">
            <Sparkles className="size-3.5" />
            برنامج دعم الطلبة
          </p>
          <h1 className="mt-2 text-3xl font-black leading-tight sm:text-4xl">ستيشن مع الطالب</h1>
          <p className="mt-2 text-sm font-bold leading-relaxed text-muted-foreground sm:text-base">
            من <b className="text-foreground">الابتدائية</b> إلى <b className="text-foreground">الجامعة</b> — دعمٌ لطلبة
            الأنبار، لأن يوم الدراسة طويل والأكل الطيب جزءٌ منه.
          </p>
        </div>

        {/* المراحل: التلميذ يرى نفسه في الصفحة قبل أن يقرأ شرطاً */}
        <div className="flex w-full flex-wrap justify-center gap-1.5">
          {STAGES.map((s) => (
            <span key={s.id} className="rounded-full border-2 border-border bg-card px-3 py-1 text-xs font-black">
              {s.label}
            </span>
          ))}
        </div>

        {/* ماذا يعطي البرنامج — ثلاثة، لا قائمة تُقرأ بالكاد */}
        <div className="grid w-full grid-cols-3 gap-2">
          <Perk icon={<Ticket className="size-6" />} title="أسعار الطالب" hint="على منيو خاص" />
          <Perk icon={<BookOpen className="size-6" />} title="أصناف تخصّكم" hint="مو بالمنيو العام" />
          <Perk icon={<UsersRound className="size-6" />} title="نقاط بالدعوة" hint="ادعُ زملاءك" />
        </div>

        <div className="w-full space-y-3">
          <Link
            href="/student/join"
            className="flex min-h-24 w-full items-center justify-center gap-4 rounded-3xl bg-primary px-6 text-primary-foreground shadow-lg transition active:scale-[0.98]"
          >
            <GraduationCap className="size-10 shrink-0" strokeWidth={1.75} />
            <span className="text-right">
              <span className="block text-2xl font-black leading-tight">سجّل بالبرنامج</span>
              <span className="block text-xs font-bold opacity-90">دقيقة وحدة — وتوصلك أسعار الطالب</span>
            </span>
          </Link>

          {token && (
            <Link
              href={`/student/${token}`}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-primary bg-card font-black text-primary transition active:scale-[0.98]"
            >
              <IdCard className="size-5" />
              افتح بطاقتي
            </Link>
          )}
        </div>

        <p className="max-w-sm text-center text-[11px] font-bold leading-relaxed text-muted-foreground">
          تسجيلك يُراجَع قبل تفعيله. وبياناتك تبقى عندنا ولا تُشارَك مع أحد —
          وإذا صوّرت هويتك <b>ما نحتفظ بالصورة</b>، نقرأ منها الاسم والمدرسة فقط.
        </p>

        <Link href="/menu" className="text-sm font-bold text-muted-foreground underline underline-offset-4">
          تصفّح المنيو العادي
        </Link>
      </section>

      <Strip items={bottom} reverse faded />
    </main>
  );
}

function Perk({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border-2 border-border bg-card px-2 py-3 text-center">
      <span className="text-primary">{icon}</span>
      <span className="text-xs font-black leading-tight">{title}</span>
      <span className="text-[10px] font-bold leading-tight text-muted-foreground">{hint}</span>
    </div>
  );
}

/** شريط الصور نفسه الذي في `/order` — نفس الحيلة: قائمةٌ مكرّرة وإزاحة ٥٠٪ */
function Strip({ items, reverse, faded = false }: { items: Shot[]; reverse: boolean; faded?: boolean }) {
  if (items.length < 2) return null;
  const doubled = [...items, ...items];
  return (
    <div aria-hidden dir="ltr" className={`pointer-events-none w-full shrink-0 overflow-hidden ${faded ? "opacity-20" : "opacity-30"}`}>
      <div className={`flex w-max gap-3 ${reverse ? "st-drift-rev" : "st-drift"}`}>
        {doubled.map((s, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${s.sm}-${i}`}
            src={s.sm}
            data-full={s.full}
            alt=""
            loading="lazy"
            onError={(e) => {
              const img = e.currentTarget;
              const full = img.dataset.full;
              if (full && img.src !== full) img.src = full;
              else img.style.display = "none";
            }}
            className="size-24 shrink-0 rounded-2xl object-cover sm:size-32"
          />
        ))}
      </div>
    </div>
  );
}
