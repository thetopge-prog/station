import Link from "next/link";
import { ChefHat, ClipboardCheck, Flame, MapPin, MessageCircle, Phone, QrCode, Smartphone, Sparkles, Star, Timer, UtensilsCrossed } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { StationSmiley } from "@/components/cafe/Logo";
import { FranchiseForm } from "./FranchiseForm";
import { isRtl, LANG_LABEL, SITE, SITE_LANGS, type SiteLang } from "@/lib/site/copy";

/**
 * واجهة ستيشن على الإنترنت — من نحن، ما نقدّم، الوكالات، وكيف تصل إلينا.
 *
 * صورها ملصقات المطعم نفسها (public/posters) لا صور مشتراة، وكل جملة فيها
 * شيء يقع في المحل فعلاً: لا نِسَب ولا وعود. والصفحة تُرسَل من الخادم كاملة
 * بلغة عنوانها، فتُفهرَس وتُشارَك — ومبدّل اللغة روابط لا حالة في المتصفح.
 */

const POSTERS = ["/posters/1.jpg", "/posters/2.jpg", "/posters/3.jpg", "/posters/4.jpg", "/posters/5.jpg", "/posters/6.jpg", "/posters/7.jpg"];
const MAPS = "https://maps.google.com/?q=Station+Ramadi+Iraq";
const TECH_ICONS = [QrCode, ChefHat, MessageCircle, Star];
const QUALITY_ICONS = [Flame, Sparkles, UtensilsCrossed, ClipboardCheck, Timer];

export function StationSite({ lang }: { lang: SiteLang }) {
  const c = SITE[lang];
  const rtl = isRtl(lang);
  const href = (l: SiteLang) => (l === "ar" ? "/" : `/${l}`);

  return (
    <main dir={rtl ? "rtl" : "ltr"} lang={lang} className="min-h-dvh bg-background text-foreground">
      {/* ── مبدّل اللغة ─────────────────────────────────────────────── */}
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-1.5 px-4 pt-4 text-xs font-black">
        {SITE_LANGS.map((l) => (
          <Link
            key={l}
            href={href(l)}
            hrefLang={l}
            className={`rounded-full px-3 py-1.5 transition ${l === lang ? "bg-primary text-primary-foreground" : "border border-border hover:bg-secondary"}`}
          >
            {LANG_LABEL[l]}
          </Link>
        ))}
      </nav>

      {/* ── الواجهة ─────────────────────────────────────────────────── */}
      <header className="relative mx-auto max-w-3xl px-5 pb-10 pt-8 text-center">
        <StationSmiley className="mx-auto size-24 text-primary sm:size-28" />
        <h1 className="mt-3 text-5xl font-black text-primary sm:text-6xl">{BRAND.nameAr}</h1>
        <p className="station-script mt-1 text-3xl text-primary">{BRAND.nameLatin}</p>
        <p className="mt-2 text-lg font-black">{c.tagline}</p>
        <p className="mx-auto mt-4 max-w-xl text-base font-bold leading-8 text-muted-foreground">{c.heroLead}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/order"
            className="flex items-center gap-2 rounded-2xl bg-primary px-7 py-3.5 text-lg font-black text-primary-foreground shadow-lg transition active:scale-[0.98]"
          >
            <Smartphone className="size-5" />
            {c.order}
          </Link>
          <a href="#about" className="rounded-2xl border-2 border-primary px-7 py-3.5 text-lg font-black text-primary">
            {c.learnMore}
          </a>
        </div>
      </header>

      <PosterStrip />

      {/* ── من نحن ──────────────────────────────────────────────────── */}
      <section id="about" className="mx-auto max-w-2xl scroll-mt-6 px-5 py-12">
        <h2 className="text-2xl font-black">{c.aboutTitle}</h2>
        {c.about.map((p) => (
          <p key={p.slice(0, 24)} className="mt-3 text-base font-bold leading-8 text-muted-foreground">
            {p}
          </p>
        ))}
      </section>

      {/* ── أول مطعم تقني ───────────────────────────────────────────── */}
      <section className="bg-secondary/50 py-12">
        <div className="mx-auto max-w-4xl px-5">
          <h2 className="text-2xl font-black text-primary">{c.techTitle}</h2>
          <p className="mt-2 text-base font-bold text-muted-foreground">{c.techLead}</p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {c.tech.map((card, i) => {
              const Icon = TECH_ICONS[i] ?? QrCode;
              return (
                <li key={card.title} className="rounded-2xl border-2 border-border bg-card p-4">
                  <h3 className="flex items-center gap-2 text-base font-black">
                    <Icon className="size-5 shrink-0 text-primary" />
                    {card.title}
                  </h3>
                  <p className="mt-1.5 text-sm font-bold leading-7 text-muted-foreground">{card.body}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ── الجودة ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-5 py-12">
        <h2 className="text-2xl font-black">{c.qualityTitle}</h2>
        <p className="mt-2 text-base font-bold text-muted-foreground">{c.qualityLead}</p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {c.quality.map((card, i) => {
            const Icon = QUALITY_ICONS[i] ?? Sparkles;
            return (
              <li key={card.title} className="rounded-2xl border-2 border-border bg-card p-4">
                <h3 className="flex items-center gap-2 text-base font-black">
                  <Icon className="size-5 shrink-0 text-primary" />
                  {card.title}
                </h3>
                <p className="mt-1.5 text-sm font-bold leading-7 text-muted-foreground">{card.body}</p>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── من المنيو ───────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-5 pb-12">
        <div className="rounded-3xl border-2 border-border bg-card p-5 text-center">
          <h2 className="text-2xl font-black">{c.menuTitle}</h2>
          <p className="mt-2 text-base font-bold text-muted-foreground">{c.menuLead}</p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {POSTERS.slice(0, 4).map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt="" loading="lazy" className="aspect-square w-full rounded-2xl object-cover" />
            ))}
          </div>
          <Link href="/menu" className="mt-5 inline-block rounded-2xl bg-primary px-6 py-3 font-black text-primary-foreground">
            {c.menuCta}
          </Link>
        </div>
      </section>

      {/* ── الوكالات ────────────────────────────────────────────────── */}
      <section id="franchise" className="bg-primary/10 py-12">
        <div className="mx-auto max-w-2xl px-5">
          <h2 className="text-2xl font-black text-primary">{c.franchiseTitle}</h2>
          <p className="mt-2 text-base font-bold leading-8 text-muted-foreground">{c.franchiseLead}</p>
          <ul className="mt-4 grid gap-2">
            {c.franchisePoints.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm font-bold">
                <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
                {p}
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-3xl border-2 border-border bg-card p-4">
            <FranchiseForm copy={c} lang={lang} />
          </div>
        </div>
      </section>

      {/* ── زورنا ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-5 py-12">
        <h2 className="text-2xl font-black">{c.visitTitle}</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border-2 border-border bg-card p-4">
            <dt className="flex items-center gap-2 text-sm font-black text-muted-foreground">
              <MapPin className="size-4 text-primary" />
              {c.address}
            </dt>
            <dd className="mt-1 text-base font-bold">{c.addressValue}</dd>
            <a href={MAPS} target="_blank" rel="noopener" className="mt-2 inline-block text-sm font-black text-primary underline">
              {c.directions}
            </a>
          </div>
          <div className="rounded-2xl border-2 border-border bg-card p-4">
            <dt className="flex items-center gap-2 text-sm font-black text-muted-foreground">
              <Timer className="size-4 text-primary" />
              {c.hours}
            </dt>
            <dd className="mt-1 text-base font-bold">{c.hoursValue}</dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href={`tel:${BRAND.phoneInText}`}
            className="flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 font-black text-primary-foreground"
          >
            <Phone className="size-5" />
            <bdi dir="ltr">{BRAND.phoneDisplay}</bdi>
          </a>
          <a
            href={`https://wa.me/${BRAND.whatsapp}`}
            target="_blank"
            rel="noopener"
            className="flex items-center gap-2 rounded-2xl bg-[#25D366] px-5 py-3 font-black text-white"
          >
            <MessageCircle className="size-5" />
            {c.whatsapp}
          </a>
        </div>
      </section>

      {/* ── التذييل ─────────────────────────────────────────────────── */}
      <footer className="border-t border-border px-5 py-8 text-center text-xs font-bold text-muted-foreground">
        <p>{c.rights}</p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
          <Link href="/privacy" className="underline">
            {c.privacy}
          </Link>
          <Link href="/sign-in" className="underline">
            {c.staff}
          </Link>
        </div>
      </footer>
    </main>
  );
}

/** شريط ملصقات ينساب — نمط OrderLandingClient نفسه، بصور المطعم */
function PosterStrip() {
  const doubled = [...POSTERS, ...POSTERS];
  return (
    <div aria-hidden dir="ltr" className="pointer-events-none w-full overflow-hidden opacity-90">
      <div className="flex w-max gap-3 st-drift">
        {doubled.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${src}-${i}`} src={src} alt="" loading="lazy" className="size-32 shrink-0 rounded-2xl object-cover sm:size-40" />
        ))}
      </div>
    </div>
  );
}
