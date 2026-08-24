"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Copy one value, and say so.
 *
 * The whole point of /setup is that nobody retypes an IP address off the back
 * of a printer at eleven at night. A copy button that gives no feedback gets
 * pressed three times and pasted once, so the label changes for a moment.
 */
export function CopyButton({
  value,
  label = "نسخ",
  className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // clipboard API needs a secure context; http://<hub-ip> is not one, so
      // fall back to the old selection trick rather than failing silently
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* nothing left to try; the value is on screen to read */
      }
      ta.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1600);
  }

  return (
    <button
      onClick={copy}
      className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-bold transition active:scale-95 ${
        done ? "border-emerald-500 text-emerald-600 dark:text-emerald-400" : "hover:bg-secondary"
      } ${className}`}
    >
      {done ? <Check className="size-4" /> : <Copy className="size-4" />}
      {done ? "تم النسخ" : label}
    </button>
  );
}
