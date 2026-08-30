"use client";

import { useEffect, useRef, useState } from "react";

/**
 * IQD entry that survives a real till.
 *
 * The fast path is unchanged: type the thousands, tap the last three digits.
 * Two failures made it worth revisiting, both from the shop floor:
 *
 *  · Somebody typed the WHOLE amount — 50000 — into a box labelled «الألوف»
 *    and got fifty million. Nobody at a restaurant till enters fifty million
 *    dinars, so four digits or more is now read as the amount itself.
 *  · Somebody typed on an Arabic keyboard. `\d` is ASCII-only, so ٥٠ stripped
 *    to nothing and silently became zero — a float of 0 recorded as if entered.
 *
 * The box keeps what was TYPED rather than a re-derived version of it. A
 * controlled field that rewrites your digits while you are still typing them
 * is how "50000" turns into "5" halfway through and nobody can explain why.
 */

const REMAINDERS = [0, 250, 500, 750] as const;
/** below this, digits mean thousands; at or above, they mean the amount */
const FULL_AMOUNT_DIGITS = 4;

/** ٠١٢٣٤٥٦٧٨٩ and ۰۱۲۳۴۵۶۷۸۹ are digits to the person typing them. */
function toLatinDigits(raw: string): string {
  return raw.replace(/[٠-٩۰-۹]/g, (d) => {
    const c = d.charCodeAt(0);
    return String(c >= 0x06f0 ? c - 0x06f0 : c - 0x0660);
  });
}

export function PriceInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const v = Math.max(0, Math.round(value || 0));
  const thousands = Math.floor(v / 1000);
  const remainder = v % 1000;

  // what the user typed, not what we would have written for them
  const [text, setText] = useState(() => (thousands ? String(thousands) : ""));
  const lastSent = useRef(v);

  useEffect(() => {
    // resync only when the value changed from OUTSIDE (a reset, a new form),
    // never in response to our own onChange — that is the fight described above
    if (v !== lastSent.current) {
      lastSent.current = v;
      setText(thousands ? String(thousands) : "");
    }
  }, [v, thousands]);

  function type(raw: string) {
    const digits = toLatinDigits(raw).replace(/[^\d]/g, "");
    setText(digits);
    const n = Math.max(0, Math.floor(Number(digits) || 0));
    const next = digits.length >= FULL_AMOUNT_DIGITS ? n : n * 1000 + remainder;
    lastSent.current = next;
    onChange(next);
  }

  function tapRemainder(r: number) {
    const digits = text.replace(/[^\d]/g, "");
    // a full amount already carries its own last three digits; the buttons
    // replace them rather than multiply what is there
    const base = digits.length >= FULL_AMOUNT_DIGITS ? Math.floor(Number(digits) / 1000) : Number(digits) || 0;
    const next = base * 1000 + r;
    lastSent.current = next;
    onChange(next);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          inputMode="numeric"
          value={text}
          onChange={(e) => type(e.target.value)}
          placeholder="المبلغ"
          dir="ltr"
          className="w-24 rounded-lg border border-input bg-background px-3 py-2 text-center outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="px-0.5 text-sm text-muted-foreground">،</span>
        <div className="flex gap-1">
          {REMAINDERS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => tapRemainder(r)}
              className={`rounded-lg border px-2.5 py-2 text-sm font-bold tabular-nums transition ${
                remainder === r ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-secondary"
              }`}
            >
              {r === 0 ? "000" : r}
            </button>
          ))}
        </div>
      </div>

      {/* the figure that will actually be saved — large enough to be argued with */}
      <p className="text-lg font-black tabular-nums">
        {v.toLocaleString("en-US")} <span className="text-sm font-bold text-muted-foreground">د.ع</span>
      </p>
    </div>
  );
}
