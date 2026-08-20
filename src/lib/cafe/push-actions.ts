"use server";

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "./auth";

/** Persist a staff device's push subscription (called after the browser grants
 *  notification permission). Upsert: re-subscribing the same device is a no-op. */
export async function savePushSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  await requireStaff();
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return { ok: false as const };
  const svc = createSupabaseServiceClient();
  const { error } = await svc
    .from("push_subscriptions")
    .upsert({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth }, { onConflict: "endpoint" });
  return { ok: !error };
}

export async function removePushSubscription(endpoint: string) {
  await requireStaff();
  if (!endpoint) return { ok: false as const };
  const svc = createSupabaseServiceClient();
  await svc.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { ok: true as const };
}
