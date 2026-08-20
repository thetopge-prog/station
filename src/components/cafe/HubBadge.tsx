"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { hubStatus, type HubStatus } from "@/lib/hub/status-actions";

/**
 * «يعمل بلا إنترنت» — the one thing staff must be able to see during an outage.
 *
 * Silent when there is nothing to say, which is nearly always: on any deployment
 * that is not the shop hub this renders nothing at all. It appears only when the
 * line is down, or while a backlog is still going up afterwards, because a badge
 * that is always there is a badge nobody reads.
 */

const POLL_MS = 15_000;

export function HubBadge() {
  const [s, setS] = useState<HubStatus | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const next = await hubStatus();
        if (alive) setS(next);
      } catch {
        /* a status badge must never be the thing that breaks a screen */
      }
    };
    void tick();
    const t = setInterval(() => void tick(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!s?.enabled) return null;
  const pending = s.orders + s.preps;
  if (s.online && pending === 0) return null;

  return (
    <span
      role="status"
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black ${
        s.online ? "bg-amber-100 text-amber-900" : "bg-red-100 text-red-900"
      }`}
      title={
        s.online
          ? "الاتصال عاد — تُرفع الطلبات المحفوظة الآن"
          : "لا يوجد إنترنت — الطلبات تُحفظ في الجهاز وتُرفع تلقائياً عند عودة الخط"
      }
    >
      {s.online ? <RefreshCw className="size-3.5 animate-spin" /> : <CloudOff className="size-3.5" />}
      {s.online ? `يرفع ${pending}` : "يعمل بلا إنترنت"}
      {!s.online && pending > 0 ? ` · ${pending}` : ""}
    </span>
  );
}
