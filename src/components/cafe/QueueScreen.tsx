import { canViewQueue, listDisplayAds, listQueue } from "@/lib/cafe/queue-actions";
import { QueueDisplayClient } from "@/components/cafe/QueueDisplayClient";
import { BRAND } from "@/lib/brand";

/** how often the ceiling display redraws itself, in seconds */
export const TV_RELOAD_S = 10;

/**
 * The waiting-area TV, behind either of its two addresses.
 *
 * Authorisation is checked HERE rather than left to the data fetches: an
 * unauthorised visitor whose fetches all fail would trip the client's watchdog
 * into reloading, and on a public URL that becomes an endless reload loop.
 *
 * The board and the slides are fetched HERE too, and handed to the client as
 * its initial state. This screen used to render empty and fill itself in from
 * the browser, which is fine on a laptop and useless on the television it was
 * built for: a set whose browser cannot run the app shows an empty board
 * forever, and nobody is standing at the ceiling to notice. Server-rendered,
 * the numbers are correct in the very first byte, on any browser ever made.
 *
 * `reloadSeconds` only tells the slideshow which beat to step on — the actual
 * redraw is an HTTP `Refresh` header set in src/proxy.ts for /tv, because Next
 * strips a <meta http-equiv="refresh"> rendered inside a component and because
 * a television suspends every JavaScript timer on a page nobody touches.
 */
export async function QueueScreen({
  displayKey,
  reloadSeconds,
}: {
  displayKey: string | null;
  reloadSeconds?: number;
}) {
  if (!(await canViewQueue(displayKey))) {
    return (
      <div dir="rtl" className="queue-screen flex flex-col items-center justify-center gap-3 bg-primary p-8 text-center text-primary-foreground">
        <p className="station-script text-6xl">{BRAND.nameLatin}</p>
        <p className="text-xl font-black">شاشة الاستلام</p>
        <p className="max-w-md text-sm font-bold opacity-90">
          هذه الشاشة تحتاج مفتاح عرض. افتحها بالرابط الذي يتضمّن المفتاح، أو سجّل دخول موظف.
        </p>
      </div>
    );
  }

  // never let a slow or failed read blank the screen — an empty board still
  // renders, and the client refreshes it a moment later
  const [rows, ads] = await Promise.all([
    listQueue(displayKey).catch(() => []),
    listDisplayAds(displayKey).catch(() => []),
  ]);

  return (
    <>
      <QueueDisplayClient
        displayKey={displayKey}
        initialRows={rows}
        initialAds={ads}
        initialAdIndex={slideNow(ads.length, reloadSeconds ?? 8)}
      />
    </>
  );
}

/**
 * Which slide it is, by the clock rather than by a timer.
 *
 * A television that cannot run a timer cannot advance a slideshow either — it
 * would show poster one for ever, which is how a menu board becomes wallpaper
 * nobody reads. Bucketing the clock by the reload interval makes each redraw
 * land on the next poster. A screen that CAN run the app takes this as its
 * starting slide and cross-fades onward as usual.
 */
function slideNow(count: number, seconds: number): number {
  if (count < 2) return 0;
  return Math.floor(Date.now() / (seconds * 1000)) % count;
}
