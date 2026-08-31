import { QueueScreen } from "@/components/cafe/QueueScreen";

/**
 * The waiting-area TV.
 *
 * Reachable three ways:
 *   · a signed-in staff member opening /queue
 *   · the ceiling display opening /tv/<STATION_DISPLAY_KEY>   ← type this one
 *   · the same display opening /queue?key=<STATION_DISPLAY_KEY>
 *
 * The key path exists because the screen is physically out of reach: a 7-day
 * session cookie would eventually put a sign-in form on the ceiling.
 *
 * Deliberately OUTSIDE the (staff) route group. That group's layout redirects to
 * /sign-in whenever getStaff() is null, which no amount of proxy configuration
 * can override — and a display authenticating by key has no staff session at
 * all. Living here also means the TV renders full-bleed, with none of the staff
 * navigation chrome a customer should never see.
 */
export const dynamic = "force-dynamic";

export default async function QueuePage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const sp = await searchParams;
  return <QueueScreen displayKey={sp.key ?? null} />;
}
