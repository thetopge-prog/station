import { canViewQueue } from "@/lib/cafe/queue-actions";
import { QueueDisplayClient } from "@/components/cafe/QueueDisplayClient";
import { BRAND } from "@/lib/brand";

/**
 * The waiting-area TV.
 *
 * Reachable two ways:
 *   · a signed-in staff member opening /queue
 *   · the ceiling display opening /queue?key=<STATION_DISPLAY_KEY>
 *
 * The key path exists because the screen is physically out of reach: a 7-day
 * session cookie would eventually put a sign-in form on the ceiling.
 *
 * Deliberately OUTSIDE the (staff) route group. That group's layout redirects to
 * /sign-in whenever getStaff() is null, which no amount of proxy configuration
 * can override — and a display authenticating by key has no staff session at
 * all. Living here also means the TV renders full-bleed, with none of the staff
 * navigation chrome a customer should never see.
 *
 * Authorisation is checked HERE rather than left to the data fetches: an
 * unauthorised visitor whose fetches all fail would trip the client's watchdog
 * into reloading, and on a public URL that becomes an endless reload loop.
 */
export const dynamic = "force-dynamic";

export default async function QueuePage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const sp = await searchParams;
  const key = sp.key ?? null;

  if (!(await canViewQueue(key))) {
    return (
      <div dir="rtl" className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-primary p-8 text-center text-primary-foreground">
        <p className="station-script text-6xl">{BRAND.nameLatin}</p>
        <p className="text-xl font-black">شاشة الاستلام</p>
        <p className="max-w-md text-sm font-bold opacity-90">
          هذه الشاشة تحتاج مفتاح عرض. افتحها بالرابط الذي يتضمّن ‎?key=‎ أو سجّل دخول موظف.
        </p>
      </div>
    );
  }

  return <QueueDisplayClient displayKey={key} />;
}
