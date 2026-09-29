"use client";

import { useState } from "react";
import { Check, Clock, Copy, GraduationCap, Share2 } from "lucide-react";
import type { StudentCard } from "@/lib/cafe/student-actions";
import { INVITE_CAP, REFERRAL_POINTS } from "@/lib/cafe/student";

/**
 * بطاقة الطالب فوق منيوه: من هو، وأين صار طلبه، ورابط دعوته.
 *
 * والدعوة هي المحرّك كلّه — فتُعطى مساحةً وزرّاً واحداً يفعل الشيء الصحيح
 * على الهاتف (مشاركة النظام)، وينسخ على الحاسوب. وعدد من قَبِلهم مكتوبٌ
 * بجانبه: رقمٌ يراه يكبر هو ما يجعله يدعو ثانيةً.
 */
export function StudentHeader({ card }: { card: StudentCard }) {
  const [copied, setCopied] = useState(false);
  const link = `${typeof window === "undefined" ? "https://stationiraq.com" : window.location.origin}/student/join?ref=${card.ref_code}`;

  async function share() {
    const text = `تعال على منيو الطلاب بمطعم المحطة 🎓 أسعار خاصة للطلاب:\n${link}`;
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch {
      /* ألغى المشاركة — يُنسَخ بدلها */
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* لا حافظة — الرابط ظاهرٌ تحت ليُنسَخ باليد */
    }
  }

  const pending = card.status === "pending";
  const rejected = card.status === "rejected";

  return (
    <div dir="rtl" className="border-b-2 border-border bg-card px-4 py-3">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-lg font-black">
            <GraduationCap className="size-5 text-primary" />
            {card.name_ar}
          </p>
          <p className="text-xs font-bold text-muted-foreground">{card.university}</p>
        </div>
        <div className="flex items-center gap-4 text-center">
          <div>
            <p className="text-xl font-black text-primary">{card.points}</p>
            <p className="text-[11px] font-bold text-muted-foreground">نقطة</p>
          </div>
          <div>
            <p className="text-xl font-black text-primary">{card.invited}</p>
            <p className="text-[11px] font-bold text-muted-foreground">دعوة مقبولة</p>
          </div>
        </div>
      </div>

      {pending && (
        <p className="mx-auto mt-2 flex w-full max-w-3xl items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-sm font-black text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <Clock className="size-4 shrink-0" />
          حسابك قيد المراجعة — تشوف المنيو بأسعاره العادية، وأسعار الطلاب توصلك أول ما نقبلك.
        </p>
      )}
      {rejected && (
        <p className="mx-auto mt-2 w-full max-w-3xl rounded-xl bg-destructive/10 px-3 py-2 text-sm font-black text-destructive">
          ما قدرنا نتأكّد من هويتك الجامعية. راجعنا بالمطعم وتنحلّ بدقيقة.
        </p>
      )}

      {!rejected && (
        <div className="mx-auto mt-2 w-full max-w-3xl rounded-xl border-2 border-primary/40 bg-secondary p-2.5">
          <p className="text-sm font-black">
            ادعُ زملاءك — <span className="text-primary">{REFERRAL_POINTS} نقطة</span> عن كل واحد يُقبل
          </p>
          <p className="mt-0.5 text-[11px] font-bold text-muted-foreground">
            حتى {INVITE_CAP} دعوات. النقاط تنزل أول ما يُقبل زميلك، مو أول ما يسجّل.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => void share()}
              className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 font-black text-primary-foreground"
            >
              {copied ? <Check className="size-4" /> : <Share2 className="size-4" />}
              {copied ? "نُسخ الرابط ✅" : "شارك رابط دعوتك"}
            </button>
            <button
              onClick={() => void share()}
              aria-label="انسخ الرابط"
              className="flex size-11 items-center justify-center rounded-xl border-2 border-border bg-card"
            >
              <Copy className="size-4" />
            </button>
          </div>
          <p dir="ltr" className="mt-1.5 truncate text-center text-[11px] font-bold text-muted-foreground">{link}</p>
        </div>
      )}
    </div>
  );
}
