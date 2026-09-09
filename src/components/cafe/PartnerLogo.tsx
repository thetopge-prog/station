"use client";

/**
 * شعار شركة التوصيل — يُعرف من اسمها أو من مفتاح المصدر على الطلب.
 *
 * الملفات في public/partners/<slug>.png. حين يغيب الملف يختفي الشعار ويبقى
 * الاسم: الصفحة لا تنكسر لأن صورة لم تُرفع بعد.
 */

import { partnerSlug } from "@/lib/cafe/partners";
export { partnerSlug };

export function PartnerLogo({ name, className = "h-6" }: { name: string | null | undefined; className?: string }) {
  const slug = partnerSlug(name);
  if (!slug) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static asset, no optimisation wanted
    <img
      src={`/partners/${slug}.png`}
      alt=""
      className={`${className} w-auto shrink-0 object-contain`}
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
    />
  );
}
