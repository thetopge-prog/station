"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Keep a screen in step with the `orders` table.
 *
 * Belt and braces, because these screens are the ones staff and customers stare
 * at and a frozen board is worse than a slow one:
 *   1. Supabase realtime on `orders` (enabled by migration 0028) → instant.
 *   2. A poll → covers a dropped socket, a sleeping TV, a proxy that reaps idle
 *      connections, and demo mode where there is no Supabase at all.
 *
 * Both funnel into the same fetcher. On error the last good data stays on
 * screen rather than blanking — a kitchen mid-rush needs the old list far more
 * than it needs an accurate error state.
 */
export function useLiveOrders<T>(
  fetcher: () => Promise<T[]>,
  { pollMs = 5000, channelName = "station-orders" }: { pollMs?: number; channelName?: string } = {},
) {
  const [rows, setRows] = useState<T[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [live, setLive] = useState(false);
  // keep the newest fetcher without making it a dependency of the subscription:
  // an inline arrow from the caller changes identity on every render and would
  // otherwise tear down and re-open the realtime channel each time.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const refresh = useCallback(async () => {
    try {
      setRows(await fetcherRef.current());
      setLoaded(true);
    } catch {
      /* keep the last good board */
    }
  }, []);

  useEffect(() => {
    // deferred by a tick: refresh() sets state, and React 19 flags a
    // synchronous setState in an effect body as a cascading render
    const kick = setTimeout(() => void refresh(), 0);
    const poll = setInterval(() => void refresh(), pollMs);
    return () => {
      clearTimeout(kick);
      clearInterval(poll);
    };
  }, [refresh, pollMs]);

  useEffect(() => {
    let supabase: ReturnType<typeof createSupabaseBrowserClient>;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      supabase = createSupabaseBrowserClient();
      channel = supabase
        .channel(channelName)
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void refresh())
        .subscribe((status) => setLive(status === "SUBSCRIBED"));
    } catch {
      // No Supabase configured (demo mode). `live` already defaults to false
      // and the poll carries the screen, so there is nothing to set here.
    }
    return () => {
      if (channel) void createSupabaseBrowserClient().removeChannel(channel);
    };
  }, [refresh, channelName]);

  return { rows, loaded, live, refresh };
}
