"use server";

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireDeveloper } from "./auth";

/**
 * What the shop's phone actually sent.
 *
 * MacroDroid's own log said «captured 07831551888» and then «422». Both true —
 * the number was on the phone and it did not arrive here — and the one fact
 * that settles which field was wrong, the body itself, was invisible. Every fix
 * after that was a guess, and guesses cost the owner a trip to the shop each.
 */
export type WebhookRow = { id: number; at: string; status: number; body: string | null; note: string | null };

export async function recentWebhooks(): Promise<WebhookRow[]> {
  await requireDeveloper();
  const svc = createSupabaseServiceClient();
  const { data } = await svc
    .from("webhook_log")
    .select("id, at, status, body, note")
    .order("id", { ascending: false })
    .limit(10);
  return data ?? [];
}
