"use client";

import { useCallback, useEffect, useState } from "react";
import { History, PhoneCall, RotateCcw, Save, Sparkles, X } from "lucide-react";
import { formatIqdLabel } from "@/lib/cafe/money";
import { latestCall, markCallHandled, saveCallerDetails, type IncomingCall, type LastLine } from "@/lib/cafe/call-actions";
import { CopyButton } from "./CopyButton";

/**
 * «الزبون يتصل الآن» — who is on the phone, before the handset is picked up.
 *
 * The slow part of a phone order was never the number. It is «شنو اسمك، وين
 * عنوانك، شنو تحب» asked of somebody who has ordered nine times already. So the
 * strip answers all three before the cashier speaks: the name, the address, and
 * last time's receipt in full — then offers the two things that can happen next.
 *
 * «تعديل الطلب» drops that receipt straight into the basket, where every line
 * can still be changed. It is not a shortcut past the cashier's judgement; it
 * is the difference between reading an order back and typing it from scratch.
 *
 * Polling, not realtime: one small query every few seconds on a screen that is
 * already open, and a socket that dies silently leaves a cashier believing
 * nobody called.
 */

const POLL_MS = 4000;

export function CallBanner({
  onUse,
  onRepeat,
}: {
  /** attach this caller to the current order (find-or-create) */
  onUse?: (call: IncomingCall) => void;
  /** attach them AND fill the basket with what they had last time */
  onRepeat?: (call: IncomingCall, lines: LastLine[]) => void;
}) {
  const [call, setCall] = useState<IncomingCall | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [saved, setSaved] = useState(false);

  const poll = useCallback(async () => {
    try {
      const next = await latestCall();
      setCall((prev) => {
        // do not blow away a half-typed address because the poll came round
        if (prev && next && prev.id === next.id) return prev;
        return next;
      });
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

  useEffect(() => {
    if (!call) return;
    // deferred a tick, the same way useLiveOrders does it: React 19 flags a
    // synchronous setState in an effect body as a cascading render
    const t = setTimeout(() => {
      setName(call.name ?? "");
      setAddress(call.address ?? "");
      // a caller we know nothing about needs the form open, not hidden behind
      // a button somebody has to think to press
      setEditing(!call.name || !call.address);
      setSaved(false);
    }, 0);
    return () => clearTimeout(t);
  }, [call]);

  if (!call) return null;

  async function dismiss() {
    const c = call;
    if (!c) return;
    setCall(null);
    await markCallHandled(c.id);
  }

  async function save() {
    const c = call;
    if (!c) return;
    const res = await saveCallerDetails(c.phone, name, address);
    if (!res.ok) return;
    setSaved(true);
    setCall({ ...c, name: name.trim() || c.name, address: address.trim() || c.address });
    setEditing(false);
  }

  const last = call.lastOrder;

  return (
    <div className="mb-3 animate-[st-card-in_.3s_both] rounded-2xl border-2 border-primary bg-primary/10 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-black text-primary">
            <PhoneCall className="size-4 animate-pulse" />
            زبون يتصل الآن
          </p>
          <p className="mt-1 truncate text-lg font-black">{call.name ?? "زبون جديد"}</p>
          {call.address && !editing && <p className="truncate text-sm font-bold text-muted-foreground">📍 {call.address}</p>}
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

      {/* ── name and address, saved on the customer ──────────────────────── */}
      {editing ? (
        <div className="mt-2 space-y-2 rounded-xl border border-border bg-background/70 p-2">
          <p className="text-xs font-black text-muted-foreground">بيانات الزبون — تُحفظ ولا تُسأل مرة أخرى</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="الاسم"
            className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="العنوان — الحي، أقرب نقطة دالة"
            className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={() => void save()}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-secondary px-4 text-sm font-bold hover:opacity-90"
          >
            <Save className="size-4" />
            حفظ البيانات
          </button>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="mt-1 text-xs font-bold text-primary underline">
          {saved ? "تم الحفظ ✓ — تعديل" : "تعديل الاسم والعنوان"}
        </button>
      )}

      {/* ── last time's receipt, in full ─────────────────────────────────── */}
      {last && (
        <div className="mt-2 rounded-xl border border-border bg-background/70 p-2">
          <p className="flex items-center gap-1 text-xs font-black text-primary">
            <History className="size-3.5" />
            طلبه السابق · #{String(last.seq).padStart(3, "0")} · {last.at.slice(0, 10)}
          </p>
          <ul className="mt-1 space-y-0.5">
            {last.lines.map((l, i) => (
              <li key={i} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-bold">
                  {l.qty > 1 && <span className="text-primary">{l.qty}× </span>}
                  {l.name}
                  {l.flavor ? <span className="text-muted-foreground"> — {l.flavor}</span> : null}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{formatIqdLabel(l.unitPrice * l.qty)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-1 flex items-baseline justify-between border-t border-border pt-1 text-sm font-black">
            <span>الإجمالي</span>
            <span className="tabular-nums">{formatIqdLabel(last.total)}</span>
          </div>
        </div>
      )}

      {/* ── what happens next ────────────────────────────────────────────── */}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {last && onRepeat && (
          <button
            onClick={() => {
              onRepeat(call, last.lines);
              void dismiss();
            }}
            className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 font-black text-primary-foreground transition active:scale-[0.99]"
          >
            <RotateCcw className="size-5" />
            نفس الطلب — للتعديل
          </button>
        )}
        {onUse && (
          <button
            onClick={() => {
              onUse(call);
              void dismiss();
            }}
            className={`inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl px-4 font-black transition active:scale-[0.99] ${
              last ? "border-2 border-primary text-primary" : "bg-primary text-primary-foreground"
            }`}
          >
            <Sparkles className="size-5" />
            طلب جديد
          </button>
        )}
      </div>
    </div>
  );
}
