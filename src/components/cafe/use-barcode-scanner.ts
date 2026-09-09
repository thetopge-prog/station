"use client";

import { useEffect, useRef } from "react";

/**
 * Global listener for a USB / Bluetooth barcode scanner.
 *
 * These devices are not cameras — to the operating system they are keyboards.
 * A scan arrives as a burst of keydown events followed by Enter, and the only
 * thing separating it from a human typing is SPEED: a scanner emits characters
 * roughly every 5–30ms, a fast human manages maybe 80ms at best.
 *
 * So the rule is: characters arriving faster than `maxGapMs` accumulate into a
 * buffer; Enter commits it; anything slower resets it. That single heuristic is
 * what makes the workflow zero-touch — the expediter picks up the bag, scans
 * the ticket stapled to it, and the customer display updates. No screen, no
 * mouse, no focus management.
 *
 * Two things it must never do:
 *   · steal keystrokes from a real input (the expediter can still type a note)
 *   · fire on a partial burst, which would look up a truncated id and fail
 */
export function useBarcodeScanner(
  onScan: (code: string) => void,
  // 150 ms, not 40: a Bluetooth HID scanner pauses between characters, and at
  // 40 the buffer was wiped mid-UUID, so the tail failed the shape check and
  // the operator rescanned — «the scan is slow»
  { maxGapMs = 150, minLength = 6 }: { maxGapMs?: number; minLength?: number } = {},
) {
  const buffer = useRef("");
  const lastKeyAt = useRef(0);
  // held in a ref so a caller passing an inline arrow does not re-bind the
  // listener on every render, which would drop a scan in progress
  const handler = useRef(onScan);
  useEffect(() => {
    handler.current = onScan;
  }, [onScan]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // never intercept real typing
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;

      const now = Date.now();
      const gap = now - lastKeyAt.current;
      lastKeyAt.current = now;

      if (e.key === "Enter") {
        const code = buffer.current;
        buffer.current = "";
        if (code.length >= minLength) {
          e.preventDefault();
          handler.current(code);
        }
        return;
      }

      // a slow keystroke is a human — start over rather than splicing their
      // keypress onto a stale buffer
      if (gap > maxGapMs) buffer.current = "";

      // printable characters only; modifiers and arrows are not part of a scan
      if (e.key.length === 1) buffer.current += e.key;
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [maxGapMs, minLength]);
}

/**
 * Is this scan one of our order tickets?
 *
 * The ticket QR encodes the raw orders.id. A UUID is self-identifying, so this
 * one regex separates a genuine ticket scan from a customer loyalty card, a
 * product barcode, or a cat on the keyboard — with no custom prefix that could
 * drift between the printer and the reader.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function orderIdFromScan(raw: string): string | null {
  const s = raw.trim();
  if (UUID_RE.test(s)) return s.toLowerCase();

  // A QR holding a URL is a plausible future ticket format. Strip the query and
  // hash FIRST, then take the last path segment — splitting on all three at
  // once picks up "v=2" from ".../<id>?v=2" instead of the id.
  const path = s.split(/[?#]/)[0] ?? "";
  const tail = path.replace(/\/+$/, "").split("/").pop() ?? "";
  return UUID_RE.test(tail) ? tail.toLowerCase() : null;
}

/**
 * The assembly ticket now encodes «908-73S» — the daily number and the pickup
 * code — instead of a 36-character UUID: seven characters make a version-1
 * QR whose modules are four times the size at the same print width, which is
 * the difference between a tablet camera reading it first time and on the
 * fourth. Both shapes are accepted; old tickets still scan.
 */
export type Scan = { kind: "uuid"; id: string } | { kind: "code"; seq: number; code: string };

const CODE_RE = /^(\d{1,4})\s*-\s*([A-Za-z0-9]{2,4})$/;
const latinDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

export function parseScan(raw: string): Scan | null {
  const id = orderIdFromScan(raw);
  if (id) return { kind: "uuid", id };
  const m = latinDigits(raw.trim()).match(CODE_RE);
  if (!m) return null;
  const seq = Number(m[1]);
  return seq > 0 ? { kind: "code", seq, code: m[2].toUpperCase() } : null;
}
