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
const TTL_MS = 30_000;
const recent = new Map<string, { at: number; id: string | null }>();

export async function openSessionIdFor(employeeId: string): Promise<string | null> {
  // البيعة تسأل عن الوردية كل مرّة والجواب لا يتغيّر إلا مرّتين في اليوم؛
  // ثلاثون ثانية تخزين تحذف سؤالاً من كل بيعة، وإغلاق الوردية يُلغيه (forgetSession)
  const hit = recent.get(employeeId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.id;
  const svc = createSupabaseServiceClient();
  const { data } = await svc
    .from("cashier_sessions")
    .select("id")
    .eq("cashier_id", employeeId)
    .is("closed_at", null)
    .maybeSingle();
  const id = data?.id ?? null;
  recent.set(employeeId, { at: Date.now(), id });
  return id;
}

/** بعد فتح وردية أو إغلاقها — الجواب القديم لا يصلح ثانيةً واحدة */
export function forgetSession(employeeId?: string): void {
  if (employeeId) recent.delete(employeeId);
  else recent.clear();
}
