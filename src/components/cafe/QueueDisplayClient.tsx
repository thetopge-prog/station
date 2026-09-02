"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { listDisplayAds, listQueue, type DisplayAd, type QueueRow } from "@/lib/cafe/queue-actions";
import { sinceLabel } from "@/lib/cafe/time";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { chimeReady, unlockAudio } from "@/lib/cafe/chime";
import { BRAND } from "@/lib/brand";
import { StationSmiley } from "./Logo";
import { useDisplayWatchdog } from "./use-display-watchdog";
import { fitColumn, pageOf, type QueueTier } from "@/lib/cafe/queue-display";

/**
 * شاشة استعداد الزبائن — the waiting-area TV.
 *
 * Two columns: «تحت التحضير» on the right (RTL reading order puts it first) and
 * «جاهز» on the left, styled loud enough to read across a room. A ready card
 * carries the order number and the pickup code and nothing else — see the note
 * on ReadyCard for why the staff names are deliberately absent.
 *
 * Neither column has a fixed size. Each measures its own box and takes the
 * biggest cards that fit; when even the smallest will not fit, it pages. The
 * board therefore cannot outgrow the screen, which it used to do silently.
 *
 * Liveness is belt-and-braces on purpose — this screen is the one thing a
 * waiting customer stares at, so it must never look frozen:
 *   1. Supabase realtime on `orders` (enabled by migration 0028) → instant.
 *   2. A 5s poll → covers a dropped socket, a sleeping TV, a proxy that kills
 *      idle connections.
 * Both funnel into the same refresh, and the poll is cheap (one small view).
 *
 * NOTE: no money is rendered here, and none is even fetched — queue_public
 * carries no monetary column at all. That is deliberate; see 0028.
 */

const POLL_MS = 5000;
/**
 * كم تبقى الصفحة قبل أن تتبدّل.
 *
 * عشر ثوانٍ عمداً: هي نفسها دورة ترويسة Refresh على التلفزيون (TV_RELOAD_S)، فكل
 * إعادة تحميل تقع على الصفحة التالية بالضبط بدل أن تقاطع واحدة في منتصفها.
 * مكرَّرة هنا رقماً لا مستوردة، لأن الاستيراد من QueueScreen يصنع حلقة.
 */
const ROTATE_S = 10;

export function QueueDisplayClient({
  displayKey = null,
  initialRows = [],
  initialAds = [],
  initialAdIndex = 0,
}: {
  displayKey?: string | null;
  /** the board as the server saw it — correct before any script runs */
  initialRows?: QueueRow[];
  initialAds?: DisplayAd[];
  /** which slide to open on — the server picks it from the clock */
  initialAdIndex?: number;
}) {
  // an unattended screen has to notice its own failures — see the hook
  const { beat, fail } = useDisplayWatchdog();
  const [rows, setRows] = useState<QueueRow[]>(initialRows);
  const [now, setNow] = useState(() => Date.now());
  const [live, setLive] = useState(false);
  // already true when the server handed us a board: `loaded` gates the switch
  // to the advert screen, and starting false made an idle screen show an empty
  // board until the first client fetch landed
  const [loaded, setLoaded] = useState(true);
  // ids already announced, so a re-render or a poll never re-rings the bell
  const announced = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const next = await listQueue(displayKey);
      setRows(next);
      setLoaded(true);
      beat();

      const ready = next.filter((r) => r.prep_status === "ready").map((r) => r.id);
      if (firstLoad.current) {
        // seed silently: opening the TV mid-service must not ring for a
        // backlog of orders that went ready ten minutes ago
        ready.forEach((id) => announced.current.add(id));
        firstLoad.current = false;
      } else if (ready.some((id) => !announced.current.has(id))) {
        ready.forEach((id) => announced.current.add(id));
        chimeReady();
      }
      // forget orders that left the screen, so the set cannot grow all day
      const alive = new Set(next.map((r) => r.id));
      announced.current.forEach((id) => {
        if (!alive.has(id)) announced.current.delete(id);
      });
    } catch {
      // keep the last good board on screen rather than blanking it — but tell
      // the watchdog, which reloads the page if this keeps happening
      fail();
    }
  }, [displayKey, beat, fail]);

  // poll + clock. The first fetch is deferred by a tick rather than run in the
  // effect body: refresh() sets state, and React 19 flags a synchronous setState
  // in an effect as a cascading render.
  useEffect(() => {
    const kick = setTimeout(() => void refresh(), 0);
    const poll = setInterval(() => void refresh(), POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), ROTATE_S * 1000);
    return () => {
      clearTimeout(kick);
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [refresh]);

  // realtime — the fast path
  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof createSupabaseBrowserClient>["channel"]> | null = null;
    try {
      const supabase = createSupabaseBrowserClient();
      channel = supabase
        .channel("station-queue")
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void refresh())
        .subscribe((status) => setLive(status === "SUBSCRIBED"));
    } catch {
      // No Supabase configured (demo mode). `live` already defaults to false and
      // the 5s poll carries the screen, so there is nothing to set here.
    }
    return () => {
      if (channel) void createSupabaseBrowserClient().removeChannel(channel);
    };
  }, [refresh]);

  // a TV is never clicked; unlock audio on any interaction the staff do make
  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const preparing = rows.filter((r) => r.prep_status === "preparing");
  const ready = rows.filter((r) => r.prep_status === "ready");

  // The whole rule: any order between «تحت التحضير» and handover holds the
  // board. Nothing in progress → adverts. Never both at once — a customer
  // hunting for their number must not have to look past a poster.
  const busy = rows.length > 0;
  if (loaded && !busy) return <AdScreen now={now} displayKey={displayKey} initialAds={initialAds} initialAdIndex={initialAdIndex} />;

  return (
    <div dir="rtl" className="queue-screen flex flex-col gap-4 bg-background p-4 lg:p-6">
      <Header live={live} now={now} />

      <div className="queue-body grid gap-4 lg:gap-6">
        {/* Each column measures its own box and picks the biggest cards that
            fit. A busy kitchen must never shrink the ready numbers — those are
            the ones a customer acts on — so the two decide independently. */}
        <Column title="تحت التحضير" tone="preparing" items={preparing} now={now} empty={loaded ? "لا توجد طلبات تحت التحضير" : "…"} />
        <Column title="جاهز" tone="ready" items={ready} now={now} empty={loaded ? "لا توجد طلبات جاهزة" : "…"} />
      </div>

      <p className="text-center text-lg font-bold text-muted-foreground">
        يرجى إبراز <span className="text-primary">رمز الاستلام</span> عند استلام الطلب
      </p>
    </div>
  );
}

/* ── idle: adverts ────────────────────────────────────────────────────────── */

/**
 * What the ceiling screen shows when the kitchen is quiet.
 *
 * Full-bleed and cross-fading, with only a thin brand bar so it reads as a
 * poster rather than a dashboard. Slides are preloaded and held in the DOM at
 * opacity 0 — a TV on shop wifi must never show a half-loaded image, and
 * swapping `src` on one <img> does exactly that.
 *
 * Falls back to a branded holding card when no ads are uploaded, so the screen
 * is never blank white.
 */
function AdScreen({ now, displayKey, initialAds = [], initialAdIndex = 0 }: { now: number; displayKey: string | null; initialAds?: DisplayAd[]; initialAdIndex?: number }) {
  const [ads, setAds] = useState<DisplayAd[]>(initialAds);
  const [i, setI] = useState(initialAdIndex);

  useEffect(() => {
    const t = setTimeout(() => void listDisplayAds(displayKey).then(setAds).catch(() => {}), 0);
    return () => clearTimeout(t);
  }, [displayKey]);

  // each slide holds for its own duration — a menu board needs longer than a
  // single-line offer poster
  useEffect(() => {
    if (ads.length < 2) return;
    const hold = (ads[i]?.duration_s ?? 8) * 1000;
    const t = setTimeout(() => setI((n) => (n + 1) % ads.length), hold);
    return () => clearTimeout(t);
  }, [ads, i]);

  // guard the index: the server picks it from the clock, and the slide count
  // can change under it when a poster is switched off mid-service
  const current = ads.length ? ads[i % ads.length] : null;

  const time = new Intl.DateTimeFormat("ar-IQ", {
    timeZone: "Asia/Baghdad",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(now));

  return (
    <div dir="rtl" className="queue-screen relative flex w-full flex-col overflow-hidden bg-primary">
      {/* Inline, not a class. Twice now the CSS minifier has undone a
          deliberate old-browser choice: it dropped a duplicated declaration
          that was there as a fallback, and it folded four separate offsets
          back into `inset: 0` — the Chrome-87 shorthand I had written out
          longhand precisely to avoid. Inline styles are in the HTML, where no
          minifier rewrites them. This is the one screen where that matters. */}
      <div style={{ position: "relative", width: "100%", height: "calc(100vh - 4.5rem)" }}>
        {!current ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 text-primary-foreground">
            <StationSmiley className="size-40" />
            <p className="station-script text-8xl">{BRAND.nameLatin}</p>
            <p className="text-4xl font-black">{BRAND.taglineAr}</p>
          </div>
        ) : (
          /* ONE poster, not all nine.
             The stack used to render every slide at once so a cross-fade never
             showed a half-loaded image. On the television that was the reason
             no poster appeared at all: nine images at ~330KB is 2.9MB, over
             shop wifi, on a page that throws itself away every ten seconds. It
             never finished, so nothing was ever cached, so the next load
             started from nothing again — a screen that could not paint a
             single poster BECAUSE it was asked for nine.
             The redraw picks the slide now, so the stack bought nothing. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={current.id}
            src={current.src}
            alt={current.title ?? ""}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
            }}
          />
        )}
      </div>

      {/* thin brand bar: keeps the screen identifiably ours between posters */}
      <div className="flex shrink-0 items-center justify-between gap-4 bg-primary px-8 py-3 text-primary-foreground">
        <div className="flex items-center gap-3">
          <StationSmiley className="size-9" />
          <span className="station-script text-3xl">{BRAND.nameLatin}</span>
        </div>
        <p className="text-2xl font-black tabular-nums" dir="ltr">
          {time}
        </p>
      </div>
    </div>
  );
}

/* ── chrome ───────────────────────────────────────────────────────────────── */

function Header({ live, now }: { live: boolean; now: number }) {
  const time = new Intl.DateTimeFormat("ar-IQ", {
    timeZone: "Asia/Baghdad",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(now));

  return (
    <header className="flex items-center justify-between gap-4 rounded-2xl bg-primary px-6 py-4 text-primary-foreground shadow-station">
      <div className="flex items-center gap-3">
        <StationSmiley className="size-12 shrink-0" />
        <div className="leading-none">
          <p className="station-script text-4xl lg:text-5xl">{BRAND.nameLatin}</p>
          <p className="mt-1 text-sm font-bold opacity-90">{BRAND.taglineAr}</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        {/* a customer never needs this; staff glancing at the TV do */}
        <span
          title={live ? "اتصال لحظي" : "تحديث دوري"}
          aria-label={live ? "اتصال لحظي" : "تحديث دوري"}
          className={`size-3 rounded-full ${live ? "bg-white" : "bg-white/40"}`}
        />
        <p className="text-4xl font-black tabular-nums lg:text-5xl" dir="ltr">
          {time}
        </p>
      </div>
    </header>
  );
}

function Column({
  title,
  tone,
  items,
  now,
  empty,
}: {
  title: string;
  tone: "preparing" | "ready";
  items: QueueRow[];
  now: number;
  empty: string;
}) {
  const ready = tone === "ready";
  const listRef = useRef<HTMLDivElement>(null);
  const [availH, setAvailH] = useState(0);

  /*
   * Measure the box, then choose the cards — never the other way round.
   *
   * The height is read off the real element on every paint because it is the
   * one number no amount of arithmetic gets right: this same board runs on a
   * 55-inch television reporting a 960×540 viewport, on a laptop, and on a
   * phone. An earlier version computed it on paper, decided nine cards fit,
   * and clipped six of them.
   *
   * The measured element holds no cards, so what it measures does not depend
   * on what we then put in it — no feedback loop, no flicker.
   */
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const read = () => setAvailH((h) => (el.clientHeight === h ? h : el.clientHeight));
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  });

  const { tier, perPage } = fitColumn(items.length, availH, { extraCols: ready ? 1 : 0 });
  const { shown, page, pages } = pageOf(items, perPage, ROTATE_S, now);

  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border-2 p-4 ${
        ready ? "border-primary bg-secondary/60" : "border-kraft/50 bg-card"
      }`}
    >
      <h2 className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <span className={`text-3xl font-black ${ready ? "text-primary" : "text-cocoa dark:text-foreground"}`}>
          {title}
        </span>
        <span
          className={`min-w-12 rounded-full px-3 py-1 text-center text-2xl font-black tabular-nums ${
            ready ? "bg-primary text-primary-foreground" : "bg-kraft/30 text-cocoa dark:text-foreground"
          }`}
        >
          {items.length}
        </span>
      </h2>

      <div ref={listRef} className="min-h-0 flex-1 overflow-hidden">
        {items.length === 0 ? (
          <p className="flex h-full items-center justify-center rounded-xl border-2 border-dashed border-border p-8 text-2xl font-bold text-muted-foreground">
            {empty}
          </p>
        ) : (
          /* Inline grid-template-columns: how many fit across is a runtime
             number, and Tailwind can only name the ones it saw at build time. */
          <ul
            className="grid content-start gap-3"
            style={{ gridTemplateColumns: `repeat(${tier.cols}, minmax(0, 1fr))` }}
          >
            {shown.map((r) =>
              ready ? <ReadyCard key={r.id} row={r} tier={tier} /> : <PreparingCard key={r.id} row={r} now={now} tier={tier} />,
            )}
          </ul>
        )}
      </div>

      {/* The row is always rendered, even with one page, so that measuring the
          list above it does not depend on how many pages there turn out to be.
          Without this the height changes the paging and the paging changes the
          height. */}
      <div className="mt-2 flex h-7 shrink-0 items-center justify-center gap-2" aria-hidden={pages < 2}>
        {pages > 1 && (
          <>
            {Array.from({ length: pages }, (_, i) => (
              <span
                key={i}
                className={`size-2.5 rounded-full ${
                  i === page ? (ready ? "bg-primary" : "bg-cocoa dark:bg-foreground") : "bg-border"
                }`}
              />
            ))}
            {/* Without a page marker a customer whose number is on page two
                believes it has vanished. The dots are the promise it returns. */}
            <span className="mr-2 text-lg font-black tabular-nums text-muted-foreground" dir="ltr">
              {page + 1}/{pages}
            </span>
          </>
        )}
      </div>
    </section>
  );
}

/* ── cards ────────────────────────────────────────────────────────────────── */

function PreparingCard({ row, now, tier }: { row: QueueRow; now: number; tier: QueueTier }) {
  const mins = Math.max(0, Math.floor((now - new Date(row.created_at).getTime()) / 60000));
  return (
    <li
      className="flex flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-kraft/40 bg-background px-2 text-center"
      style={{ height: tier.cardH }}
    >
      <p className="font-black leading-none tabular-nums text-cocoa dark:text-foreground" style={{ fontSize: tier.font }}>
        {String(row.order_seq).padStart(3, "0")}
      </p>
      {row.pickup_code && (
        <p className="mt-1 font-bold leading-none tabular-nums text-muted-foreground" style={{ fontSize: tier.code }} dir="ltr">
          {row.pickup_code}
        </p>
      )}
      <p className="mt-1.5 font-bold leading-none text-muted-foreground" style={{ fontSize: tier.meta }}>
        {row.table_no ? `طاولة ${row.table_no}` : CHANNEL_AR[row.channel] ?? ""} · {sinceLabel(mins)}
      </p>
    </li>
  );
}

function ReadyCard({ row, tier }: { row: QueueRow; tier: QueueTier }) {
  return (
    <li
      className="flex flex-col items-center justify-center overflow-hidden rounded-2xl bg-primary px-2 text-center text-primary-foreground shadow-station-lg"
      style={{ height: tier.cardH, animation: "st-ready-in 420ms ease-out, st-ready-glow 1.6s ease-in-out 2" }}
    >
      <p className="font-black leading-none tabular-nums" style={{ fontSize: tier.font }}>
        {String(row.order_seq).padStart(3, "0")}
      </p>

      {row.pickup_code && (
        <p className="mx-auto mt-1.5 w-fit rounded-full bg-white px-3 py-0.5 font-black leading-none tabular-nums text-primary" style={{ fontSize: tier.code }} dir="ltr">
          {row.pickup_code}
        </p>
      )}

      {/* No staff names. A customer scanning a board from across the room is
          looking for one thing — their number — and every other line is
          something to read past first. Who served them is on the receipt and
          in the dashboard, where it is actually used. */}

      {row.table_no && <p className="mt-1 font-black leading-none" style={{ fontSize: tier.meta }}>طاولة {row.table_no}</p>}
    </li>
  );
}

const CHANNEL_AR: Record<string, string> = {
  cashier: "كاشير",
  qr: "طاولة",
  kiosk: "كشك",
  delivery: "توصيل",
  pickup: "استلام",
};
