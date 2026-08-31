import { canViewQueue } from "@/lib/cafe/queue-actions";
import { QueueDisplayClient } from "@/components/cafe/QueueDisplayClient";
import { BRAND } from "@/lib/brand";

/**
 * The waiting-area TV, behind either of its two addresses.
 *
 * Authorisation is checked HERE rather than left to the data fetches: an
 * unauthorised visitor whose fetches all fail would trip the client's watchdog
 * into reloading, and on a public URL that becomes an endless reload loop.
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

  return <QueueDisplayClient displayKey={displayKey} />;
}
