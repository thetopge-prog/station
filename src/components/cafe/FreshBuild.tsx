"use client";

import { useEffect, useRef } from "react";

/**
 * يُحدّث الصفحة حين يُنشر بناءٌ جديد — **وهي خالية**.
 *
 * Next يُولّد لكل «إجراء خادم» معرّفاً جديداً عند كل بناء، فصفحةٌ بقيت مفتوحة
 * من قبل النشر تنادي معرّفاً لم يعد موجوداً. والخادم يردّ بخطأ، والشاشة تقول
 * «تعذّر إتمام الطلب — تأكد من الاتصال»، والاتصال سليم.
 *
 * وقع هذا على **كل طلبٍ في يومٍ كامل**: نُشرت دفعاتٌ تباعاً وشاشة الكاشير
 * مفتوحة منذ الصباح، فصار كل بيعٍ يفشل حتى تُحدَّث الصفحة بيد أحد.
 *
 * والشرط `idle` هو كل شيء: لا يُحدَّث وسلّةٌ فيها أصناف، ولا ونافذةٌ مفتوحة،
 * ولا والكاشير يكتب. صفحةٌ تُحدَّث تحت يد من يبيع أسوأ من صفحةٍ قديمة.
 */
export function FreshBuild({ idle }: { idle: () => boolean }) {
  // المرجع يُحدَّث في أثرٍ لا في الرندر: القاعدة في React 19، ويُقرأ داخل
  // مؤقّتٍ يعيش طويلاً فلا يصلح أن يُحتجز على أوّل نسخةٍ من الدالّة
  const idleRef = useRef(idle);
  useEffect(() => {
    idleRef.current = idle;
  }, [idle]);

  useEffect(() => {
    let mine: number | null = null;
    let stop = false;

    const check = async () => {
      try {
        const res = await fetch("/api/build", { cache: "no-store" });
        const { id } = (await res.json()) as { id?: number };
        if (stop || typeof id !== "number") return;
        if (mine === null) {
          mine = id;
          return;
        }
        // بناءٌ جديد، والشاشة فارغة → تُحدَّث الآن قبل أن يبدأ بيعٌ عليها
        if (id !== mine && idleRef.current()) window.location.reload();
      } catch {
        /* الشبكة تتعثّر أحياناً؛ المحاولة التالية بعد دقيقة */
      }
    };

    void check();
    const t = setInterval(() => void check(), 60_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  return null;
}
