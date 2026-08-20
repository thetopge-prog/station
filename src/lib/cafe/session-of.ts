import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * The open cashier session for an employee, or null.
 *
 * Every money movement calls this so it can be attributed. Deliberately a plain
 * function rather than a server action: it is called FROM server actions, and a
 * nested "use server" export would be a needless round trip.
 *
 * Returning null is not an error — the owner adding an expense from their phone
 * has no drawer open, and that expense still has to be recorded.
 */
export async function openSessionIdFor(employeeId: string): Promise<string | null> {
  const svc = createSupabaseServiceClient();
  const { data } = await svc
    .from("cashier_sessions")
    .select("id")
    .eq("cashier_id", employeeId)
    .is("closed_at", null)
    .maybeSingle();
  return data?.id ?? null;
}
