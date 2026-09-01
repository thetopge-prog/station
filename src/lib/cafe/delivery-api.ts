import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { secretMatches } from "./machine-auth";

/**
 * The door a delivery company comes through.
 *
 * Every partner gets its OWN key. The temptation was to hand out
 * STATION_WEBHOOK_SECRET, which already exists — but that one key also opens
 * the caller-ID intake, and a company that changes staff every month would be
 * holding it. Revoking a partner then means rotating a secret on the shop's
 * phone too. One key per partner, revoked by generating another.
 */
export type Partner = { id: string; name_ar: string; delivery_fee: number };

/** Resolve the caller from `x-partner-key`, or null. Never says which partner failed. */
export async function partnerFromKey(req: Request): Promise<Partner | null> {
  const key = (req.headers.get("x-partner-key") ?? new URL(req.url).searchParams.get("key") ?? "").trim();
  if (!key) return null;

  const svc = createSupabaseServiceClient();
  const { data } = await svc
    .from("delivery_partners")
    .select("id, name_ar, api_key, delivery_fee")
    .eq("is_active", true);

  // Compared in constant time against every active partner rather than looked
  // up by equality: a WHERE on the key would make the database's index timing
  // part of the answer.
  const hit = (data ?? []).find((p) => secretMatches(key, (p.api_key ?? "").trim()));
  return hit ? { id: hit.id, name_ar: hit.name_ar, delivery_fee: hit.delivery_fee ?? 0 } : null;
}

/** Diagnostics for a partner integrating against us, written down once. */
export function log(route: string, status: number, body: string, note: string) {
  try {
    const svc = createSupabaseServiceClient();
    void svc.rpc("log_webhook", {
      p_route: route,
      p_status: status,
      // the partner's own key must not be written into a table staff can read
      p_body: body.replace(/([a-f0-9]{32,})/gi, "***").slice(0, 600),
      p_note: note,
    });
  } catch {
    /* a diagnostic that breaks the request it describes is worse than none */
  }
}
