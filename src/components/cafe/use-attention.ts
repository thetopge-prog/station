"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * «البائع الصامت» — what the customer is actually looking at.
 *
 * ── PRIVACY, stated up front ──────────────────────────────────────────────
 * Everything here lives in a ref for the life of one page view. Nothing is
 * written to storage, nothing is sent to a server, nothing identifies a person.
 * Close the tab and it is gone. The only inputs are IntersectionObserver and
 * scroll/touch events — no camera, no microphone, no biometrics, no permission
 * prompt of any kind, because a menu that asks for a permission gets closed.
 *
 * ── What "looking at" means ───────────────────────────────────────────────
 * A card being on screen is not attention — a card someone scrolled past is on
 * screen too. Dwell only accrues when the card is at least 60% visible AND the
 * page has been still for a moment. That distinction is the whole feature: it
 * separates "reading about the mushroom burger" from "scrolling to the sauces".
 */

const VISIBLE_RATIO = 0.6;
/** how long the page must be still before we call it looking rather than passing */
const SETTLE_MS = 320;
const TICK_MS = 250;

export type Attention = {
  /** total ms each item was genuinely looked at */
  items: Record<string, number>;
  /** total ms per category, and how many times it was re-opened */
  categories: Record<string, { ms: number; visits: number }>;
  /** items whose image was tapped open — a much stronger signal than dwell */
  taps: Record<string, number>;
};

export function useAttention({
  onIntent,
  intentMs = 4000,
}: {
  /** fired once per item when dwell crosses the threshold */
  onIntent?: (itemId: string) => void;
  intentMs?: number;
} = {}) {
  const data = useRef<Attention>({ items: {}, categories: {}, taps: {} });
  const visible = useRef<Map<string, string>>(new Map()); // itemId → categoryName
  const lastScrollAt = useRef(0);
  const fired = useRef<Set<string>>(new Set());
  const observer = useRef<IntersectionObserver | null>(null);
  const elToItem = useRef<WeakMap<Element, { id: string; cat: string }>>(new WeakMap());
  const intent = useRef(onIntent);
  const [, force] = useState(0);

  useEffect(() => {
    intent.current = onIntent;
  }, [onIntent]);

  /**
   * The observer, built on FIRST USE rather than in an effect.
   *
   * React attaches refs during commit and runs effects afterwards, so an
   * observer created in useEffect does not exist yet when the cards' ref
   * callbacks fire — every card would be silently skipped and nothing would
   * ever be tracked. Creating it lazily here means the first `track` call
   * builds it, which is exactly when it is needed.
   */
  const getObserver = useCallback(() => {
    if (observer.current) return observer.current;
    if (typeof IntersectionObserver === "undefined") return null;
    observer.current = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const meta = elToItem.current.get(e.target);
          if (!meta) continue;
          if (e.isIntersecting && e.intersectionRatio >= VISIBLE_RATIO) visible.current.set(meta.id, meta.cat);
          else visible.current.delete(meta.id);
        }
      },
      { threshold: [0, VISIBLE_RATIO, 1] },
    );
    return observer.current;
  }, []);

  useEffect(() => {
    return () => {
      observer.current?.disconnect();
      observer.current = null;
    };
  }, []);

  // ── "the page is still" ─────────────────────────────────────────────────
  useEffect(() => {
    const bump = () => {
      lastScrollAt.current = Date.now();
    };
    // capture:true so it also catches the scrolling container, not just window
    window.addEventListener("scroll", bump, { passive: true, capture: true });
    window.addEventListener("touchmove", bump, { passive: true });
    window.addEventListener("wheel", bump, { passive: true });
    return () => {
      window.removeEventListener("scroll", bump, true);
      window.removeEventListener("touchmove", bump);
      window.removeEventListener("wheel", bump);
    };
  }, []);

  // ── accrue ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      // still scrolling → this is passing by, not looking
      if (Date.now() - lastScrollAt.current < SETTLE_MS) return;
      // tab hidden → the phone is in a pocket
      if (document.visibilityState !== "visible") return;

      for (const [id, cat] of visible.current) {
        const next = (data.current.items[id] ?? 0) + TICK_MS;
        data.current.items[id] = next;
        const c = data.current.categories[cat] ?? { ms: 0, visits: 0 };
        data.current.categories[cat] = { ...c, ms: c.ms + TICK_MS };

        if (next >= intentMs && !fired.current.has(id)) {
          fired.current.add(id);
          intent.current?.(id);
        }
      }
    }, TICK_MS);
    return () => clearInterval(t);
  }, [intentMs]);

  /** ref callback for a product card */
  const track = useCallback(
    (id: string, cat: string) => {
      return (el: HTMLElement | null) => {
        if (!el) return;
        const io = getObserver();
        if (!io) return;
        elToItem.current.set(el, { id, cat });
        io.observe(el);
      };
    },
    [getObserver],
  );

  /** the customer opened this item — intent far stronger than dwell */
  const tap = useCallback((id: string) => {
    data.current.taps[id] = (data.current.taps[id] ?? 0) + 1;
  }, []);

  /** they came back to a category; repeat visits mean they are deciding in it */
  const visitCategory = useCallback((cat: string) => {
    const c = data.current.categories[cat] ?? { ms: 0, visits: 0 };
    data.current.categories[cat] = { ...c, visits: c.visits + 1 };
  }, []);

  /**
   * Items ranked by how much attention they got.
   *
   * A tap is worth three seconds of staring: opening an item is a deliberate
   * act, while dwell can be someone reading the label of the thing above it.
   */
  const ranked = useCallback((min = 800): { id: string; score: number }[] => {
    const d = data.current;
    return Object.entries(d.items)
      .map(([id, ms]) => ({ id, score: ms + (d.taps[id] ?? 0) * 3000 }))
      .filter((x) => x.score >= min)
      .sort((a, b) => b.score - a.score);
  }, []);

  const topCategories = useCallback((): string[] => {
    return Object.entries(data.current.categories)
      .sort((a, b) => b[1].ms + b[1].visits * 2000 - (a[1].ms + a[1].visits * 2000))
      .map(([c]) => c);
  }, []);

  /** call after checkout so a second order starts from a clean slate */
  const reset = useCallback(() => {
    data.current = { items: {}, categories: {}, taps: {} };
    fired.current.clear();
    force((n) => n + 1);
  }, []);

  return { track, tap, visitCategory, ranked, topCategories, reset };
}
