import { canViewQueue, listDisplayAds, listQueue } from "@/lib/cafe/queue-actions";
import { QueueDisplayClient } from "@/components/cafe/QueueDisplayClient";
import { BRAND } from "@/lib/brand";

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
 */
export async function QueueScreen({ displayKey }: { displayKey: string | null }) {
  if (!(await canViewQueue(displayKey))) {
    return (
      <div dir="rtl" className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-primary p-8 text-center text-primary-foreground">
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
      <QueueDisplayClient displayKey={displayKey} initialRows={rows} initialAds={ads} />
      <StaleReload />
    </>
  );
}

/**
 * The last line of defence for a screen nobody can reach.
 *
 * If the app hydrates, it sets `window.__stationLive` and this does nothing at
 * all. If it does not — an old television browser choking on a modern bundle,
 * a half-loaded script, an evicted chunk — the page reloads itself every
 * fifteen seconds, and the server-rendered board is correct on arrival. A
 * board that is fifteen seconds stale is a working board; one frozen at
 * whatever was on it an hour ago is a wrong one, and a customer trusts it
 * either way.
 *
 * Deliberately ES5, deliberately inline, deliberately not a module: it has to
 * run on precisely the browser that could not run everything else.
 */
function StaleReload() {
  const js =
    "setTimeout(function(){if(!window.__stationLive){setInterval(function(){location.reload()},15000)}},15000)";
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
