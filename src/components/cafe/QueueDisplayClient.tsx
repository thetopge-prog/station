"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listDisplayAds, listQueue, type DisplayAd, type QueueRow } from "@/lib/cafe/queue-actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { chimeReady, unlockAudio } from "@/lib/cafe/chime";
import { BRAND } from "@/lib/brand";
import { StationSmiley } from "./Logo";
import { useDisplayWatchdog } from "./use-display-watchdog";

/**
 * شاشة استعداد الزبائن — the waiting-area TV.
 *
 * Two columns: «قيد التجهيز» on the right (RTL reading order puts it first) and
 * «جاهز للاستلام» on the left, styled loud enough to read across a room. Each
 * ready card shows what the spec asks for: order number, security code, cashier
 * name, expediter name.
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
    const clock = setInterval(() => setNow(Date.now()), 30_000);
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

  // Tells the inline ES5 guard in QueueScreen that hydration succeeded, so it
  // never starts its reload loop. If this line never runs, that guard is the
  // only thing keeping the board from freezing.
  useEffect(() => {
    (window as unknown as { __stationLive?: boolean }).__stationLive = true;
  }, []);

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

      <div className="queue-body grid gap-4 lg:grid-cols-2 lg:gap-6">
        {/* قيد التجهيز — calm, kraft-toned */}
        <Column
          title="تحت التحضير"
          count={preparing.length}
          tone="preparing"
          empty={loaded ? "لا توجد طلبات تحت التحضير" : "…"}
        >
          {preparing.map((r) => (
            <PreparingCard key={r.id} row={r} now={now} />
          ))}
        </Column>

        {/* جاهز للاستلام — the loud one */}
        <Column
          title="جاهز"
          count={ready.length}
          tone="ready"
          empty={loaded ? "لا توجد طلبات جاهزة" : "…"}
        >
          {ready.map((r) => (
            <ReadyCard key={r.id} row={r} />
          ))}
        </Column>
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

  const time = new Intl.DateTimeFormat("ar-IQ", {
    timeZone: "Asia/Baghdad",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(now));

  return (
    <div dir="rtl" className="queue-screen relative flex w-full flex-col overflow-hidden bg-primary">
      <div className="queue-body relative">
        {ads.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 text-primary-foreground">
            <StationSmiley className="size-40" />
            <p className="station-script text-8xl">{BRAND.nameLatin}</p>
            <p className="text-4xl font-black">{BRAND.taglineAr}</p>
          </div>
        ) : (
          ads.map((ad, n) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={ad.id}
              src={ad.src}
              alt={ad.title ?? ""}
              className="absolute inset-0 h-full w-full object-contain transition-opacity duration-700"
              style={{ opacity: n === i ? 1 : 0 }}
              // the first slide is the one the customer sees on walk-in
              loading={n === 0 ? "eager" : "lazy"}
            />
          ))
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
  count,
  tone,
  empty,
  children,
}: {
  title: string;
  count: number;
  tone: "preparing" | "ready";
  empty: string;
  children: React.ReactNode;
}) {
  const ready = tone === "ready";
  return (
    <section
      className={`flex min-h-0 flex-col rounded-2xl border-2 p-4 ${
        ready ? "border-primary bg-secondary/60" : "border-kraft/50 bg-card"
      }`}
    >
      <h2 className="mb-4 flex items-center justify-between gap-3">
        <span className={`text-3xl font-black lg:text-4xl ${ready ? "text-primary" : "text-cocoa dark:text-foreground"}`}>
          {title}
        </span>
        <span
          className={`min-w-12 rounded-full px-3 py-1 text-center text-2xl font-black tabular-nums ${
            ready ? "bg-primary text-primary-foreground" : "bg-kraft/30 text-cocoa dark:text-foreground"
          }`}
        >
          {count}
        </span>
      </h2>
      {count === 0 ? (
        <p className="flex flex-1 items-center justify-center rounded-xl border-2 border-dashed border-border p-8 text-2xl font-bold text-muted-foreground">
          {empty}
        </p>
      ) : (
        <ul className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto sm:grid-cols-2">{children}</ul>
      )}
    </section>
  );
}

/* ── cards ────────────────────────────────────────────────────────────────── */

function PreparingCard({ row, now }: { row: QueueRow; now: number }) {
  const mins = Math.max(0, Math.floor((now - new Date(row.created_at).getTime()) / 60000));
  return (
    <li className="rounded-2xl border-2 border-kraft/40 bg-background p-4 text-center">
      <p className="text-6xl font-black tabular-nums text-cocoa dark:text-foreground">
        {String(row.order_seq).padStart(3, "0")}
      </p>
      {row.pickup_code && (
        <p className="mt-1 text-xl font-bold tabular-nums text-muted-foreground" dir="ltr">
          {row.pickup_code}
        </p>
      )}
      <p className="mt-2 text-base font-bold text-muted-foreground">
        {row.table_no ? `طاولة ${row.table_no}` : CHANNEL_AR[row.channel] ?? ""} · {mins} د
      </p>
    </li>
  );
}

function ReadyCard({ row }: { row: QueueRow }) {
  return (
    <li
      className="rounded-2xl bg-primary p-4 text-center text-primary-foreground shadow-station-lg"
      style={{ animation: "st-ready-in 420ms ease-out, st-ready-glow 1.6s ease-in-out 2" }}
    >
      <p className="text-7xl font-black leading-none tabular-nums lg:text-8xl">
        {String(row.order_seq).padStart(3, "0")}
      </p>

      {row.pickup_code && (
        <p className="mx-auto mt-3 w-fit rounded-full bg-white px-5 py-1 text-3xl font-black tabular-nums text-primary" dir="ltr">
          {row.pickup_code}
        </p>
      )}

      {/* cashier + expediter, as the spec requires */}
      <dl className="mt-3 space-y-0.5 text-base font-bold opacity-95">
        {row.cashier_name && (
          <div className="flex items-center justify-center gap-1.5">
            <dt className="opacity-80">الكاشير:</dt>
            <dd>{row.cashier_name}</dd>
          </div>
        )}
        {row.expediter_name && (
          <div className="flex items-center justify-center gap-1.5">
            <dt className="opacity-80">المجهّز:</dt>
            <dd>{row.expediter_name}</dd>
          </div>
        )}
      </dl>

      {row.table_no && <p className="mt-2 text-lg font-black">طاولة {row.table_no}</p>}
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
