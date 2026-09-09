"use server";

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "./auth";

/**
 * تنبيهات طلبات شركات التوصيل — ما وصل من جهاز توترز/طلباتي ولم يُضغط عليه «تمّ».
 *
 * نافذة قصيرة: تنبيه من قبل ساعة ليس تنبيهاً بل تاريخ، والشاشة يجب أن تبقى
 * سطراً واحداً لا قائمة تتراكم.
 */

const WINDOW_MINUTES = 90;

export type ExternalAlert = {
  id: string;
  source: "toters" | "talabaty" | "other";
  ref: string | null;
  title: string | null;
  body: string | null;
  order_id: string | null;
  created_at: string;
  /** أسماء من شاشة الشركة لا مقابل لها عندنا بعد — تُربط من /partners */
  unknown_items: string[] | null;
};

export async function latestExternalAlerts(): Promise<ExternalAlert[]> {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { data } = await svc
    .from("external_order_alerts")
    .select("id, source, ref, title, body, order_id, created_at, unknown_items")
    .is("handled_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(8);
  return (data ?? []) as ExternalAlert[];
}

export async function markAlertHandled(id: string) {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  const { error } = await svc.from("external_order_alerts").update({ handled_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}
