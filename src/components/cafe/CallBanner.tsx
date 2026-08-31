"use client";

import { useCallback, useEffect, useState } from "react";
import { PhoneCall, X } from "lucide-react";
import { latestCall, markCallHandled, type IncomingCall, type LastLine } from "@/lib/cafe/call-actions";
import { CallerCard } from "./CallerCard";

/**
 * «الزبون يتصل الآن» — the strip, and nothing more.
 *
 * It answers one question four seconds at a time: is the phone ringing, and
 * whose number is it? Everything heavier — the addresses, the previous
 * receipts, the two buttons — lives in the card behind it, loaded only when
 * somebody taps.
 *
 * That split is deliberate and was learned the hard way. When the strip fetched
 * a receipt on every tick, it turned the busiest screen in the shop into four
 * database round trips every four seconds, to a database ~320ms away, almost
 * always to be told nobody is calling.
 *
 * The card does not open by itself: a cashier halfway through somebody else's
 * order should not have the screen taken from them by a wrong number.
 */

const POLL_MS = 4000;

export function CallBanner({
  onUse,
  onRepeat,
}: {
  /** attach this caller to the current order (find-or-create) */
  onUse?: (phone: string) => void;
  /** attach them AND fill the basket with one of their previous orders */
  onRepeat?: (phone: string, lines: LastLine[]) => void;
}) {
  const [call, setCall] = useState<IncomingCall | null>(null);
  const [open, setOpen] = useState(false);

  const poll = useCallback(async () => {
    try {
      const next = await latestCall();
      setCall((prev) => (prev && next && prev.id === next.id ? prev : next));
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
    setOpen(false);
    setCall(null);
    await markCallHandled(c.id);
  }

  return (
    <>
      <div className="mb-3 flex animate-[st-card-in_.3s_both] items-center gap-2 rounded-2xl border-2 border-primary bg-primary/10 p-2.5">
        <button onClick={() => setOpen(true)} className="flex min-w-0 flex-1 items-center gap-2 text-right">
          <PhoneCall className="size-5 shrink-0 animate-pulse text-primary" />
          <span className="min-w-0">
            <span className="block text-xs font-black text-primary">زبون يتصل الآن — اضغط للفتح</span>
            <span className="block truncate text-base font-black">{call.name ?? "زبون جديد"}</span>
            {/* a WhatsApp caller in the phone's contacts arrives as a name and
                no number — say so, rather than printing a dash that reads like
                a broken field */}
            <span className={`block text-xs ${call.phone ? "text-muted-foreground" : "font-bold text-amber-600"}`} dir={call.phone ? "ltr" : "rtl"}>
              {call.phone ?? "مكالمة واتساب — بلا رقم"}
            </span>
          </span>
        </button>
        <button
          onClick={() => void dismiss()}
          aria-label="إخفاء"
          className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
        >
          <X className="size-5" />
        </button>
      </div>

      {open && (
        <CallerCard
          call={call}
          onClose={() => setOpen(false)}
          onUse={(phone) => {
            onUse?.(phone);
            void dismiss();
          }}
          onRepeat={(phone, lines) => {
            onRepeat?.(phone, lines);
            void dismiss();
          }}
          onDetailsSaved={(name, address) => setCall({ ...call, name, address })}
        />
      )}
    </>
  );
}
