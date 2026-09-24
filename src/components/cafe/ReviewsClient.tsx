"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageCircle, Star } from "lucide-react";
import { markReviewAsked, type ReviewDue } from "@/lib/cafe/review-actions";
import { normaliseIraqiPhone, whatsappOrderLink } from "@/lib/brand";
import { sinceLabel } from "@/lib/cafe/time";

/**
 * قائمة الإرسال اليدوي.
 *
 * النافذة تُفتح **قبل** الختم لا بعده — حاجب النوافذ المنبثقة في المتصفّح لا
 * يسمح بفتح نافذةٍ إلّا في نفس دورة الضغطة، فأي `await` قبلها يبتلعها. وهو
 * القيد نفسه الموثَّق في `ExpediterClient.notifyCustomer`.
 */
export function ReviewsClient({ rows }: { rows: ReviewDue[] }) {
  const router = useRouter();
  const [done, setDone] = useState<Record<string, true>>({});
  const left = rows.filter((r) => !done[r.id]);

  function send(r: ReviewDue) {
    const phone = normaliseIraqiPhone(r.phone);
    window.open(whatsappOrderLink(r.message, phone), "_blank", "noopener");
    setDone((d) => ({ ...d, [r.id]: true }));
    void markReviewAsked(r.id).then(() => router.refresh());
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-3">
      <h1 className="flex items-center gap-2 text-xl font-black">
        <Star className="size-5 text-primary" />
        رسائل التقييم
        {left.length > 0 && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-sm text-primary-foreground">{left.length}</span>
        )}
      </h1>
      <p className="text-sm font-bold text-muted-foreground">
        هؤلاء استلموا طلبهم وأشّر الكاشير أن يُطلب منهم تقييم جوجل. اضغط «أرسل» فيفتح واتساب والرسالة مكتوبة —
        وأنت تضغط إرسال.
      </p>

      {left.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-border p-6 text-center font-black text-muted-foreground">
          ما عدنا رسائل بالانتظار ✅
        </p>
      ) : (
        <ul className="space-y-2">
          {left.map((r) => (
            <li key={r.id} className="rounded-2xl border-2 border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-black">
                    {r.name?.trim() || "زبون"}
                    <span className="ms-2 text-sm font-bold text-muted-foreground">#{String(r.orderSeq).padStart(3, "0")}</span>
                  </p>
                  <p className="text-sm font-bold text-muted-foreground">
                    <bdi dir="ltr">{r.phone}</bdi>
                    {" · "}
                    {sinceLabel(r.waitedMin)}
                    {r.focus ? ` · ${r.focus} ×٣` : ""}
                  </p>
                </div>
                <button
                  onClick={() => send(r)}
                  className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 font-black text-primary-foreground"
                >
                  <MessageCircle className="size-4" />
                  أرسل
                </button>
              </div>
              {/* النصّ ظاهرٌ لا مخفيّ: الموظّف يرسل باسم المحل، ومن حقّه أن يقرأ ما يرسله */}
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-black text-primary">شوف الرسالة</summary>
                <p className="mt-1 whitespace-pre-wrap rounded-xl bg-secondary p-2 text-sm font-bold">{r.message}</p>
              </details>
            </li>
          ))}
        </ul>
      )}

      {Object.keys(done).length > 0 && (
        <p className="flex items-center justify-center gap-1.5 text-sm font-black text-primary">
          <Check className="size-4" />
          أُرسلت {Object.keys(done).length}
        </p>
      )}
    </div>
  );
}
