"use client";

/**
 * شعار شركة التوصيل — يُعرف من اسمها أو من مفتاح المصدر على الطلب.
 *
 * الملفات في public/partners/<slug>.png. حين يغيب الملف يختفي الشعار ويبقى
 * الاسم: الصفحة لا تنكسر لأن صورة لم تُرفع بعد.
 */

const SLUGS: [RegExp, string][] = [
  [/toters|توترز/i, "toters"],
  [/talabat|طلبات/i, "talabatey"],
  [/\bzad\b|زاد/i, "zad"],
];

export function partnerSlug(nameOrSource: string | null | undefined): string | null {
  if (!nameOrSource) return null;
  return SLUGS.find(([re]) => re.test(nameOrSource))?.[1] ?? null;
}

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
