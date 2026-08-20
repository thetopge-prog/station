import { getPublicSupabaseConfig } from "@/lib/supabase/constants";

/**
 * Demo mode = no Supabase configured. Lets the app run (menu + ordering, no login)
 * with local seed data for a quick trial. Flips OFF automatically the moment real
 * NEXT_PUBLIC_SUPABASE_* creds are present, with no code change.
 */
export function isDemoServer(): boolean {
  return getPublicSupabaseConfig() === null;
}

export function isDemoClient(): boolean {
  if (typeof window === "undefined") return false;
  const env = (window as unknown as { __ENV__?: { supabaseUrl?: string } }).__ENV__;
  return !env?.supabaseUrl;
}
