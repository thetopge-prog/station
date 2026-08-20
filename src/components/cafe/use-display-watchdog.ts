"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Keeps an unattended screen alive.
 *
 * The customer display is bolted to the ceiling. Nobody is going to reach it to
 * dismiss a dialog, tap "reload", or notice that it froze at 6pm and has been
 * showing a stale board ever since. Smart-TV browsers in particular evict
 * background pages from memory and never bring them back on their own.
 *
 * So the page watches itself. Four independent guards, because each one covers
 * a failure the others miss:
 *
 *   heartbeat  — the data went stale even though nothing threw. Covers a frozen
 *                timer, a suspended JS engine, a socket that died silently.
 *   wake       — the device slept. A large jump in wall-clock time between
 *                ticks is the only reliable signal; timers do not fire while
 *                suspended, so the heartbeat alone would not catch it.
 *   errors     — consecutive fetch failures. Covers wifi that came back on a
 *                different subnet, or a deploy that invalidated the bundle.
 *   nightly    — a full reload in the small hours. Clears whatever memory the
 *                browser leaked over 18 hours and picks up the latest deploy
 *                without anyone thinking about it.
 *
 * Everything here is a last resort: a reload loses nothing, because the screen
 * holds no state a customer can lose.
 */

export type WatchdogOptions = {
  /** reload if no successful refresh within this window */
  staleMs?: number;
  /** consecutive failures tolerated before reloading */
  maxErrors?: number;
  /** hour (Baghdad) for the nightly reload — pick a closed hour */
  nightlyHour?: number;
};

export function useDisplayWatchdog({
  staleMs = 90_000,
  maxErrors = 3,
  nightlyHour = 5,
}: WatchdogOptions = {}) {
  // 0 = "not seen yet"; both are stamped by the first tick / first beat. Seeding
  // them with Date.now() would read the clock during render, which React 19
  // rightly flags as impure.
  const lastOk = useRef(0);
  const lastTick = useRef(0);
  const errors = useRef(0);
  const reloading = useRef(false);

  const reload = useCallback((why: string) => {
    if (reloading.current) return;
    reloading.current = true;
    // the only diagnostic anyone will ever get off a ceiling screen
    console.warn(`[station-display] reloading: ${why}`);
    window.location.reload();
  }, []);

  /** call after every successful data refresh */
  const beat = useCallback(() => {
    lastOk.current = Date.now();
    errors.current = 0;
  }, []);

  /** call when a refresh throws */
  const fail = useCallback(() => {
    errors.current += 1;
    if (errors.current >= maxErrors) reload(`${errors.current} consecutive fetch failures`);
  }, [maxErrors, reload]);

  useEffect(() => {
    // seed here rather than at render: the first tick is 15s away and both
    // clocks must already be running when it arrives
    lastTick.current = Date.now();
    if (lastOk.current === 0) lastOk.current = Date.now();

    const tick = setInterval(() => {
      const now = Date.now();

      // wake detection: timers do not fire while a device is suspended, so a
      // gap far larger than the interval means we just came back from sleep
      if (now - lastTick.current > 60_000) {
        lastTick.current = now;
        reload("device woke from sleep");
        return;
      }
      lastTick.current = now;

      if (now - lastOk.current > staleMs) {
        reload(`no fresh data for ${Math.round((now - lastOk.current) / 1000)}s`);
        return;
      }

      // nightly: only in the first minute of the chosen hour, so it fires once
      const baghdad = new Date(now + (3 * 60 + new Date().getTimezoneOffset()) * 60_000);
      if (baghdad.getHours() === nightlyHour && baghdad.getMinutes() === 0) {
        reload("nightly refresh");
      }
    }, 15_000);
    return () => clearInterval(tick);
  }, [staleMs, nightlyHour, reload]);

  // coming back to the foreground is the cheapest moment to notice staleness
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastOk.current > staleMs) reload("stale on focus");
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [staleMs, reload]);

  // hold the screen on where the platform supports it; harmless where it does not
  useEffect(() => {
    type WakeLock = { release: () => Promise<void> };
    let lock: WakeLock | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLock> } };

    const acquire = async () => {
      try {
        lock = (await nav.wakeLock?.request("screen")) ?? null;
      } catch {
        /* denied, unsupported, or not user-activated — the OS power plan covers it */
      }
    };
    void acquire();
    // the lock is dropped whenever the page is hidden; take it again on return
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, []);

  return { beat, fail };
}
