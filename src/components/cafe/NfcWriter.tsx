"use client";

import { useState } from "react";
import { Check, Copy, Nfc } from "lucide-react";

/** Writes the table's menu URL onto an NFC tag. Web NFC (NDEFReader) works on
 *  Android Chrome only; elsewhere (iOS) we just show the URL to write with an
 *  NFC-writer app like «NFC Tools». Customers tapping the tag open the URL
 *  natively — no app needed on their side. */
export function NfcWriter({ url }: { url: string }) {
  const [state, setState] = useState<"idle" | "writing" | "done" | "copied" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);

  async function write() {
    setErr(null);
    if (!("NDEFReader" in window)) {
      setState("error");
      setErr("متصفحك لا يدعم الكتابة المباشرة — انسخ الرابط واكتبه بتطبيق «NFC Tools».");
      return;
    }
    setState("writing");
    try {
      // @ts-expect-error Web NFC is not in the TS DOM lib yet
      await new NDEFReader().write({ records: [{ recordType: "url", data: url }] });
      setState("done");
    } catch (e) {
      setState("error");
      setErr((e as Error).message);
    }
  }
  async function copy() {
    await navigator.clipboard.writeText(url).catch(() => {});
    setState("copied");
  }

  return (
    <div className="mt-2 space-y-1 text-xs">
      <div className="flex gap-1.5">
        <button onClick={write} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary px-2 py-1.5 font-semibold text-primary-foreground hover:opacity-90">
          <Nfc className="size-3.5" />
          {state === "writing" ? "قرّب البطاقة…" : state === "done" ? "تمت الكتابة ✓" : "اكتب NFC"}
        </button>
        <button onClick={copy} aria-label="نسخ الرابط" className="flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 hover:bg-secondary">
          {state === "copied" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      <p dir="ltr" className="truncate text-[10px] text-muted-foreground">{url}</p>
      {err && <p className="text-[10px] text-destructive">{err}</p>}
    </div>
  );
}
