"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { baghdadNow } from "@/lib/cafe/hours";

/**
 * «الدرج ما زال مفتوح والساعة تعدّت ٣:٣٠».
 *
 * البوت لا ينظر إلى الساعة: ما يفتح الطلبات هو وجود وردية كاشير مفتوحة. فإن
 * نسي الكاشير إغلاق الدرج وراح، بقي البوت يستقبل طلبات الساعة الخامسة فجراً
 * **وما من أحد في المطبخ** — فيَعِد زبوناً بطعامٍ لن يُطبخ.
 *
 * وهذا التنبيه يقف في وجه من يقف عند الكاونتر. وهو يُعرَض داخل شاشة الكاشير
 * وحدها، وهي لا تُرسَم أصلاً إلا والوردية مفتوحة (`CashierSessionGate`) — فلا
 * يحتاج سؤال القاعدة عن شيء: وجودُه على الشاشة هو الدليل.
 *
 * ولا يُغلَق بزرّ: زرُّ الإغلاق يجعله شيئاً يُزاح لا شيئاً يُفعَل. يزول وحده
 * حين تُقفَل الوردية.
 */

/** من ٣:٣٠ فجراً إلى ٩ صباحاً — بعد آخر إغلاقٍ معقول وقبل أول فتحٍ معقول */
const FROM = 3 * 60 + 30;
const TO = 9 * 60;

function isLate(now: Date = new Date()): boolean {
  const { minutes } = baghdadNow(now);
  return minutes >= FROM && minutes < TO;
}

export function LateDrawerNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // في أثرٍ لا في الرندر: `new Date()` نداءٌ غير صافٍ، وReact 19 يرفضه
    const check = () => setShow(isLate());
    const first = setTimeout(check, 0);
    const id = setInterval(check, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  if (!show) return null;

  return (
    <div
      dir="rtl"
      className="rounded-2xl border-2 border-amber-500 bg-amber-50 p-4 text-amber-900 lg:col-span-2 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <p className="flex items-center gap-2 text-lg font-black">
        <AlertTriangle className="size-5 shrink-0" />
        الوردية ما زالت مفتوحة
      </p>
      <p className="mt-1 text-sm font-bold leading-relaxed">
        مرّت الثالثة والنصف والدرج ما انقفل. والبوت يتبع الوردية لا الساعة — يعني
        يستقبل طلبات واتساب هسة والمطبخ فاضي، ويوعد زبون بأكل ما راح ينطبخ.
        <br />
        <span className="font-black">اقفل الوردية من «جرد اليوم»</span>، وإذا بعدك تشتغل تجاهل هذا السطر.
      </p>
    </div>
  );
}
