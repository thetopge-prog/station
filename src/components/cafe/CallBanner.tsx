"use client";

import { useCallback, useEffect, useState } from "react";
import { PhoneCall, X } from "lucide-react";
import { latestCall, markCallHandled, type IncomingCall } from "@/lib/cafe/call-actions";
import { CopyButton } from "./CopyButton";

/**
 * «الزبون يتصل الآن» — who is on the phone, before the handset is picked up.
 *
 * The slow part of a phone order was never the number. It is «شنو اسمك، وين
 * عنوانك» for somebody who has ordered nine times already. So the strip leads
 * with the name and the address and treats the number as the small print.
 *
 * Polling, not realtime: this is one tiny query every few seconds on a screen
 * that is already open, and a socket that silently dies leaves the cashier
 * believing nobody called.
 */

const POLL_MS = 4000;

export function CallBanner({ onUse }: { onUse?: (call: IncomingCall) => void }) {
  const [call, setCall] = useState<IncomingCall | null>(null);

  const poll = useCallback(async () => {
    try {
      setCall(await latestCall());
    } catch {
      /* signed out or offline — a banner must never break the till */
    }
  }, []);

  useEffect(() => {
    const kick = setTimeout(() => void poll(), 0);
    const t = setInterval(() => void poll(), POLL_MS);
    return () => {
      clearTimeout(kick);
      clearInterval(t);
    };
  }, [poll]);

  if (!call) return null;

  async function dismiss() {
    const c = call;
    if (!c) return;
    setCall(null);
    await markCallHandled(c.id);
  }

  return (
    <div className="mb-3 animate-[st-card-in_.3s_both] rounded-2xl border-2 border-primary bg-primary/10 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-black text-primary">
            <PhoneCall className="size-4 animate-pulse" />
            زبون يتصل الآن
          </p>
          <p className="mt-1 truncate text-lg font-black">{call.name ?? "زبون جديد"}</p>
          {call.address && <p className="truncate text-sm font-bold text-muted-foreground">📍 {call.address}</p>}
          <p className="text-xs text-muted-foreground" dir="ltr">
            {call.phone}
            {call.points != null ? ` · ${call.points} نقطة` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <button onClick={() => void dismiss()} aria-label="إخفاء" className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary">
            <X className="size-4" />
          </button>
          <CopyButton value={call.phone} label="نسخ الرقم" />
        </div>
      </div>

      {onUse && (
        <button
          onClick={() => {
            onUse(call);
            void dismiss();
          }}
          className="mt-2 min-h-11 w-full rounded-xl bg-primary px-4 font-black text-primary-foreground transition active:scale-[0.99]"
        >
          {call.name ? `ابدأ طلب ${call.name}` : "ابدأ طلباً لهذا الرقم"}
        </button>
      )}
    </div>
  );
}
