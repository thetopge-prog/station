"use server";

import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { getStaff } from "./auth";

/**
 * The ceiling display authenticates with a KEY, not a session.
 *
 * A staff cookie lasts 7 days. The screen is bolted to a ceiling. Those two
 * facts are incompatible: sooner or later it would show a sign-in form nobody
 * can reach. So /queue accepts ?key=<STATION_DISPLAY_KEY> and the actions below
 * accept either that key or a normal staff session.
 *
 * Safe to expose this way because queue_public carries no monetary column at
 * all (0028/0032) — order number, pickup code, and two staff first names.
 */
function keyMatches(given: string | null | undefined): boolean {
  const expected = process.env.STATION_DISPLAY_KEY;
  // fail closed: with no key configured, only a real session gets in
  if (!expected || !given || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/**
 * Can this viewer see the queue at all? Non-throwing, for the page shell.
 *
 * The page MUST answer this before rendering the client: an unauthorised
 * visitor whose data fetches all fail would trip the display watchdog, which
 * reloads the page — on a public URL that is an infinite reload loop, i.e. a
 * self-inflicted DoS. Better to render a flat notice and never mount the
 * watchdog at all.
 */
export async function canViewQueue(displayKey?: string | null): Promise<boolean> {
  if (keyMatches(displayKey)) return true;
  return (await getStaff()) !== null;
}

/** Either a signed-in staff member, or the display key. Throws otherwise. */
async function requireStaffOrKey(displayKey?: string | null): Promise<boolean> {
  if (keyMatches(displayKey)) return true;
  const staff = await getStaff();
  if (!staff) throw new Error("غير مصرّح — سجّل الدخول.");
  return false;
}

/**
 * Feed for the waiting-area TV and the expediter screen.
 *
 * Reads the queue_public view (0028), which is money-free by construction: a
 * screen the public can read must never leak a subtotal, a discount, or a cost.
 */
export type QueueRow = {
  id: string;
  order_seq: number;
  pickup_code: string | null;
  prep_status: "preparing" | "ready";
  table_no: string | null;
  channel: string;
  created_at: string;
  cashier_name: string | null;
  expediter_name: string | null;
};

export async function listQueue(displayKey?: string | null): Promise<QueueRow[]> {
  const viaKey = await requireStaffOrKey(displayKey);
  // a key-authenticated screen has no Supabase session, so it reads through the
  // service client; the view it reads is money-free either way
  const supabase = viaKey ? createSupabaseServiceClient() : await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("queue_public")
    .select("id, order_seq, pickup_code, prep_status, table_no, channel, created_at, cashier_name, expediter_name");
  if (error) return [];
  return (data ?? []) as QueueRow[];
}

export type DisplayAd = { id: string; title: string | null; src: string; duration_s: number };

/**
 * Slides for the TV to show while no order is in progress.
 *
 * Storage URLs are rewritten to the /img/* path so they come through the CDN
 * edge rather than hitting Supabase in ap-southeast-2 from Ramadi — the same
 * trick the customer menu uses for product photos (see netlify.toml).
 */
export async function listDisplayAds(displayKey?: string | null): Promise<DisplayAd[]> {
  const viaKey = await requireStaffOrKey(displayKey);
  const supabase = viaKey ? createSupabaseServiceClient() : await createSupabaseServerClient();
  const { data } = await supabase
    .from("display_ads")
    .select("id, title, image_url, duration_s")
    .eq("is_active", true)
    .order("sort", { ascending: true });

  return (data ?? []).map((a) => {
    const m = a.image_url.match(/\/storage\/v1\/object\/public\/menu\/(.+)$/);
    return { id: a.id, title: a.title, src: m ? `/img/${m[1]}` : a.image_url, duration_s: a.duration_s };
  });
}
