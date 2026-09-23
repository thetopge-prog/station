import Link from "next/link";
import { ChefHat, ChevronDown, ClipboardCheck, Flame, MapPin, MessageCircle, Phone, QrCode, Smartphone, Sparkles, Star, Timer, UtensilsCrossed } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { StationSmiley } from "@/components/cafe/Logo";
import { FranchiseForm } from "./FranchiseForm";
import { Reveal } from "./Reveal";
import { HtmlLang } from "./HtmlLang";
import { isRtl, LANG_LABEL, SITE, SITE_LANGS, type SiteLang } from "@/lib/site/copy";

/**
 * واجهة ستيشن على الإنترنت.
 *
 * موقع مطعم لا صفحة نصّ: ترويسة لاصقة، واجهة فيها صورة البركر تطفو داخل قرص
 * تدور حوله حلقة الاسم، شريط ينساب، أقسام مرقّمة تظهر عند التمرير، ثم
 * الوكالات والأسئلة. كل صورة من ملصقات المطعم نفسها (public/posters) وكل
 * جملة شيء يقع في المحل — لا نِسَب ولا صور مشتراة.
 *
 * تُرسَل من الخادم كاملة بلغة عنوانها (‎/‎، ‎/en‎، ‎/tr‎، ‎/it‎، ‎/ku‎)، فتُفهرَس
 * وتُشارَك؛ ومبدّل اللغة روابط لا حالة في المتصفح.
 */

const P = (n: number | string) => `/posters/${n}.jpg`;
const MAPS = "https://maps.google.com/?q=Station+Ramadi+Iraq";
const TECH_ICONS = [QrCode, ChefHat, MessageCircle, Star];
const QUALITY_ICONS = [Flame, Sparkles, UtensilsCrossed, ChefHat, ClipboardCheck];
const QUALITY_SHOTS = [P(1), P(5), P(2), P(6), P("m1")];

export function StationSite({ lang }: { lang: SiteLang }) {
  const c = SITE[lang];
  const rtl = isRtl(lang);
  const href = (l: SiteLang) => (l === "ar" ? "/" : `/${l}`);
  const nav = [
    ["#about", c.nav.about],
    ["#why", c.nav.why],
    ["#menu", c.nav.menu],
    ["#franchise", c.nav.franchise],
    ["#contact", c.nav.contact],
  ] as const;

  return (
    <div dir={rtl ? "rtl" : "ltr"} lang={lang} className="min-h-dvh overflow-x-hidden bg-background text-foreground">
      <HtmlLang lang={lang} />
      {/* ── الترويسة ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <Link href={href(lang)} className="flex shrink-0 items-center gap-2">
            <StationSmiley className="size-8 text-primary" />
            <span className="text-xl font-black text-primary">{BRAND.nameAr}</span>
          </Link>

          <nav className="hidden flex-1 items-center justify-center gap-5 text-sm font-black lg:flex">
            {nav.map(([to, label]) => (
              <a key={to} href={to} className="transition hover:text-primary">
                {label}
              </a>
            ))}
          </nav>

          <div className="ms-auto flex items-center gap-2 lg:ms-0">
            <details className="relative">
              <summary className="flex cursor-pointer list-none items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-black">
                {LANG_LABEL[lang]}
                <ChevronDown className="size-3.5" />
              </summary>
              <ul className="absolute end-0 z-50 mt-1 w-36 overflow-hidden rounded-xl border-2 border-border bg-card shadow-lg">
                {SITE_LANGS.map((l) => (
                  <li key={l}>
                    <Link
                      href={href(l)}
                      hrefLang={l}
                      className={`block px-3 py-2 text-sm font-black transition hover:bg-secondary ${l === lang ? "text-primary" : ""}`}
                    >
                      {LANG_LABEL[l]}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
            <Link href="/order" className="rounded-full bg-primary px-4 py-2 text-sm font-black text-primary-foreground shadow-sm">
              {c.order}
            </Link>
          </div>
        </div>
      </header>

      {/* ── الواجهة ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -start-24 -top-24 size-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -end-24 size-80 rounded-full bg-kraft/25 blur-3xl" />
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-5 py-10 md:grid-cols-2 md:py-16">
          <div className="text-center md:text-start">
            <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-primary bg-primary/10 px-3 py-1 text-xs font-black text-primary">
              <Sparkles className="size-3.5" />
              {c.badge}
            </span>
            <h1 className="station-display mt-4 text-5xl leading-tight sm:text-6xl md:text-7xl">{c.heroTitle}</h1>
            <p className="mt-3 text-lg font-black text-primary">{c.tagline}</p>
            <p className="mx-auto mt-3 max-w-lg text-base font-bold leading-8 text-muted-foreground md:mx-0">{c.heroLead}</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 md:justify-start">
              <Link
                href="/order"
                className="flex items-center gap-2 rounded-2xl bg-primary px-7 py-3.5 text-lg font-black text-primary-foreground shadow-lg transition hover:opacity-95 active:scale-[0.98]"
              >
                <Smartphone className="size-5" />
                {c.order}
              </Link>
              <Link href="/menu" className="rounded-2xl border-2 border-primary px-7 py-3.5 text-lg font-black text-primary">
                {c.menuCta}
              </Link>
            </div>
            <a href="#about" className="mt-6 inline-flex items-center gap-1 text-xs font-black text-muted-foreground">
              {c.scrollCue}
              <ChevronDown className="size-4 st-float" />
            </a>
          </div>

          <HeroDisc />
        </div>
      </section>

      <Ticker items={c.ticker} />

      {/* ── من نحن ───────────────────────────────────────────────────── */}
      <section id="about" className="mx-auto max-w-6xl scroll-mt-16 px-5 py-14">
        <div className="grid items-center gap-8 md:grid-cols-2">
          <Reveal>
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={P(3)} alt="" loading="lazy" className="aspect-4/5 w-full rounded-[2rem] object-cover shadow-xl" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={P(7)} alt="" loading="lazy" className="absolute -bottom-6 -end-4 hidden size-40 rounded-3xl border-4 border-background object-cover shadow-xl sm:block" />
            </div>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="text-3xl font-black">{c.aboutTitle}</h2>
            {c.about.map((p) => (
              <p key={p.slice(0, 24)} className="mt-4 text-base font-bold leading-8 text-muted-foreground">
                {p}
              </p>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── لماذا نحن ٠١–٠٥ ──────────────────────────────────────────── */}
      <section id="why" className="scroll-mt-16 bg-secondary/40 py-14">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-center text-3xl font-black">{c.qualityTitle}</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-base font-bold text-muted-foreground">{c.qualityLead}</p>
          <ol className="mt-10 grid gap-10">
            {c.quality.map((card, i) => {
              const Icon = QUALITY_ICONS[i] ?? Sparkles;
              return (
                <li key={card.title}>
                  <Reveal>
                    <div className={`grid items-center gap-5 md:grid-cols-2 ${i % 2 ? "md:[&>figure]:order-last" : ""}`}>
                      <figure className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={QUALITY_SHOTS[i] ?? P(1)} alt="" loading="lazy" className="aspect-video w-full rounded-3xl object-cover shadow-lg" />
                      </figure>
                      <div>
                        {/* الرقم سطرٌ فوق العنوان لا طبقةٌ خلفه: على الهاتف كان يركب على الكلام */}
                        <span aria-hidden className="block text-5xl font-black leading-none text-primary/25">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <h3 className="mt-1 flex items-center gap-2 text-xl font-black">
                          <Icon className="size-6 shrink-0 text-primary" />
                          {card.title}
                        </h3>
                        <p className="mt-2 text-base font-bold leading-8 text-muted-foreground">{card.body}</p>
                      </div>
                    </div>
                  </Reveal>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* ── ما يميّزنا تقنياً ────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <h2 className="text-3xl font-black text-primary">{c.techTitle}</h2>
        <p className="mt-2 max-w-2xl text-base font-bold text-muted-foreground">{c.techLead}</p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {c.tech.map((card, i) => {
            const Icon = TECH_ICONS[i] ?? QrCode;
            return (
              <li key={card.title}>
                <Reveal delay={i * 90} className="h-full">
                  <div className="h-full rounded-3xl border-2 border-border bg-card p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
                    <span className="grid size-11 place-items-center rounded-2xl bg-primary/10">
                      <Icon className="size-6 text-primary" />
                    </span>
                    <h3 className="mt-3 text-base font-black">{card.title}</h3>
                    <p className="mt-1.5 text-sm font-bold leading-7 text-muted-foreground">{card.body}</p>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── من المنيو ────────────────────────────────────────────────── */}
      <section id="menu" className="mx-auto max-w-6xl scroll-mt-16 px-5 pb-14">
        <div className="rounded-[2rem] border-2 border-border bg-card p-6 text-center shadow-sm">
          <h2 className="text-3xl font-black">{c.menuTitle}</h2>
          <p className="mt-2 text-base font-bold text-muted-foreground">{c.menuLead}</p>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((n, i) => (
              <Reveal key={n} delay={i * 70}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={P(n)}
                  alt=""
                  loading="lazy"
                  className="aspect-square w-full rounded-2xl object-cover transition duration-300 hover:scale-[1.03]"
                />
              </Reveal>
            ))}
          </div>
          <Link href="/menu" className="mt-6 inline-block rounded-2xl bg-primary px-7 py-3.5 text-lg font-black text-primary-foreground shadow-lg">
            {c.menuCta}
          </Link>
        </div>
      </section>

      {/* ── وعد التوصيل ──────────────────────────────────────────────── */}
      <section className="bg-primary py-14 text-primary-foreground">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-5 md:grid-cols-2">
          <Reveal>
            <h2 className="text-3xl font-black">{c.deliveryTitle}</h2>
            <p className="mt-3 text-base font-bold leading-8 opacity-95">{c.deliveryLead}</p>
            <ul className="mt-5 grid gap-2">
              {c.deliveryPoints.map((p) => (
                <li key={p} className="flex items-start gap-2 text-base font-black">
                  <span className="mt-2 size-2 shrink-0 rounded-full bg-primary-foreground" />
                  {p}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={120}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={P("m2")} alt="" loading="lazy" className="aspect-4/3 w-full rounded-[2rem] object-cover shadow-2xl" />
          </Reveal>
        </div>
      </section>

      {/* ── الوكالات ─────────────────────────────────────────────────── */}
      <section id="franchise" className="scroll-mt-16 bg-secondary/40 py-14">
        <div className="mx-auto max-w-3xl px-5">
          <Reveal>
            <h2 className="text-3xl font-black text-primary">{c.franchiseTitle}</h2>
            <p className="mt-3 text-base font-bold leading-8 text-muted-foreground">{c.franchiseLead}</p>
            <ul className="mt-4 grid gap-2">
              {c.franchisePoints.map((p) => (
                <li key={p} className="flex items-start gap-2 text-sm font-bold">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                  {p}
                </li>
              ))}
            </ul>
            <div className="mt-7 rounded-[2rem] border-2 border-border bg-card p-5 shadow-lg">
              <FranchiseForm copy={c} lang={lang} />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── أسئلة شائعة ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-5 py-14">
        <h2 className="text-3xl font-black">{c.faqTitle}</h2>
        <div className="mt-6 grid gap-3">
          {c.faq.map((qa) => (
            <details key={qa.q} className="group rounded-2xl border-2 border-border bg-card p-4 open:border-primary">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-base font-black">
                {qa.q}
                <ChevronDown className="size-5 shrink-0 text-primary transition group-open:rotate-180" />
              </summary>
              <p className="mt-2 text-sm font-bold leading-7 text-muted-foreground">{qa.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── تواصل ────────────────────────────────────────────────────── */}
      <section id="contact" className="mx-auto max-w-6xl scroll-mt-16 px-5 pb-14">
        <h2 className="text-3xl font-black">{c.visitTitle}</h2>
        <dl className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border-2 border-border bg-card p-5">
            <dt className="flex items-center gap-2 text-sm font-black text-muted-foreground">
              <MapPin className="size-4 text-primary" />
              {c.address}
            </dt>
            <dd className="mt-1 text-lg font-black">{c.addressValue}</dd>
            <a href={MAPS} target="_blank" rel="noopener" className="mt-2 inline-block text-sm font-black text-primary underline">
              {c.directions}
            </a>
          </div>
          <div className="rounded-3xl border-2 border-border bg-card p-5">
            <dt className="flex items-center gap-2 text-sm font-black text-muted-foreground">
              <Timer className="size-4 text-primary" />
              {c.hours}
            </dt>
            <dd className="mt-1 text-lg font-black">{c.hoursValue}</dd>
          </div>
        </dl>
        <div className="mt-5 flex flex-wrap gap-3">
          <a href={`tel:${BRAND.phoneInText}`} className="flex items-center gap-2 rounded-2xl bg-primary px-6 py-3.5 text-lg font-black text-primary-foreground shadow-lg">
            <Phone className="size-5" />
            <bdi dir="ltr">{BRAND.phoneDisplay}</bdi>
          </a>
          <a
            href={`https://wa.me/${BRAND.whatsapp}`}
            target="_blank"
            rel="noopener"
            className="flex items-center gap-2 rounded-2xl bg-[#25D366] px-6 py-3.5 text-lg font-black text-white shadow-lg"
          >
            <MessageCircle className="size-5" />
            {c.whatsapp}
          </a>
        </div>
      </section>

      {/* ── التذييل ──────────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-card px-5 py-9">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 text-center">
          <StationSmiley className="size-10 text-primary" />
          <p className="station-script text-2xl text-primary">{BRAND.nameLatin}</p>
          <p className="text-xs font-bold text-muted-foreground">{c.rights}</p>
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-black">
            <Link href="/menu" className="hover:text-primary">
              {c.nav.menu}
            </Link>
            <a href="#franchise" className="hover:text-primary">
              {c.nav.franchise}
            </a>
            <Link href="/privacy" className="hover:text-primary">
              {c.privacy}
            </Link>
            <Link href="/sign-in" className="text-muted-foreground hover:text-primary">
              {c.staff}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * حركة البركر: قرص يحمل الصورة ويطفو، وحلقة الاسم تدور حوله.
 *
 * الملصقات مربّعة بخلفية برتقالية لا صوراً مقصوصة، فالقرص هو الحيلة: يُخفي
 * الحواف ويجعل الخلفية جزءاً من التصميم. والحلقة نصٌّ على مسار SVG — لا صورة
 * تُحمَّل ولا مكتبة.
 */
function HeroDisc() {
  // صورتان تدوران حول القرص وتبقيان معتدلتين: الحاوية تدور والصورة تدور عكسها
  const orbit = [
    { src: P(1), pos: "start-1/2 top-0 -translate-x-1/2" },
    { src: P(5), pos: "start-1/2 bottom-0 -translate-x-1/2" },
  ];
  return (
    <div className="relative mx-auto grid aspect-square w-full max-w-sm place-items-center md:max-w-md">
      {/* حلقة متقطّعة تدور ببطء — إطار القرص لا زينة زائدة */}
      <svg viewBox="0 0 200 200" aria-hidden className="st-spin-slow absolute inset-0 size-full text-primary/45">
        <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="7 9" strokeLinecap="round" />
      </svg>

      {/* القرص: صورة البركر تطفو */}
      <div className="st-float relative aspect-square w-[72%]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={P(4)} alt="" className="size-full rounded-full object-cover shadow-2xl ring-8 ring-background" />
      </div>

      <div className="st-spin pointer-events-none absolute inset-0">
        {orbit.map((o) => (
          <div key={o.src} className={`absolute ${o.pos} st-spin-rev`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={o.src} alt="" loading="lazy" className="size-16 rounded-full border-4 border-background object-cover shadow-xl sm:size-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** شريط ينساب بكلمات المطعم — يفصل الواجهة عمّا بعدها بلا خطّ ميت */
function Ticker({ items }: { items: string[] }) {
  const line = [...items, ...items];
  return (
    <div aria-hidden dir="ltr" className="overflow-hidden border-y-2 border-primary/20 bg-primary/10 py-2.5">
      <div className="flex w-max items-center gap-6 st-drift">
        {line.map((t, i) => (
          <span key={`${t}-${i}`} className="flex items-center gap-6 whitespace-nowrap text-sm font-black text-primary">
            {t}
            <Sparkles className="size-3.5 opacity-70" />
          </span>
        ))}
      </div>
    </div>
  );
}
