import { BRAND } from "@/lib/brand";
import { hoursLine } from "@/lib/cafe/hours";
import { StationSmiley } from "./Logo";

/** «المطعم مغلق الآن» — ما يراه الزبون بدل المنيو حين لا صندوق مفتوحاً. */
export function ShopClosed() {
  return (
    <main dir="rtl" className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <StationSmiley className="size-24 text-primary" />
      <p className="station-script text-4xl text-primary">{BRAND.nameLatin}</p>
      <h1 className="text-2xl font-black">المطعم مغلق الآن 🌙</h1>
      <p className="max-w-xs text-sm font-bold leading-relaxed text-muted-foreground">
        نستقبل طلباتكم {hoursLine()}. المنيو يفتح تلقائياً مع بداية الدوام.
      </p>
      <a href={`https://wa.me/${BRAND.whatsapp}`} className="mt-2 rounded-2xl bg-primary px-6 py-3 font-black text-primary-foreground">
        راسلنا على واتساب
      </a>
      <p className="text-xs font-bold text-muted-foreground">
        {BRAND.addressAr} · <bdi dir="ltr">{BRAND.phoneDisplay}</bdi>
      </p>
    </main>
  );
}
