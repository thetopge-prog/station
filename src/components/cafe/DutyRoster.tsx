"use client";

import { useEffect, useState } from "react";
import { Check, Users } from "lucide-react";
import { dutyRoster, setDutyExpediters, type DutyPerson } from "@/lib/cafe/duty-actions";

/**
 * «من يجهّز اليوم؟» — one row of buttons on the till.
 *
 * Deliberately not a form: no save button, no dialog, no page of its own. The
 * cashier taps a name when somebody starts and taps it again when they leave,
 * and that is the entire interaction. Anything heavier would be skipped on a
 * busy evening, and a roster nobody fills in is worse than none — it looks
 * like an answer.
 *
 * It is collapsed to a single line once anybody is ticked, because after the
 * first minute of the shift it is not the thing the cashier needs to see.
 */
export function DutyRoster() {
  const [people, setPeople] = useState<DutyPerson[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void dutyRoster()
      .then((r) => alive && setPeople(r))
      .catch(() => alive && setPeople([]));
    return () => {
      alive = false;
    };
  }, []);

  if (!people?.length) return null;

  const on = people.filter((p) => p.onDuty);

  async function toggle(id: string) {
    if (!people) return;
    // optimistic: a tap on a till has to look instant, and the worst case is a
    // name that flicks back when the server disagrees
    const next = people.map((p) => (p.id === id ? { ...p, onDuty: !p.onDuty } : p));
    setPeople(next);
    setBusy(id);
    const res = await setDutyExpediters(next.filter((p) => p.onDuty).map((p) => p.id));
    if (!res.ok) setPeople(people);
    setBusy(null);
  }

  return (
    <div className="mb-3 rounded-2xl border border-border bg-secondary/40 p-2.5">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-right">
        <Users className="size-5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold text-muted-foreground">مجهّزو اليوم</span>
          <span className="block truncate text-sm font-black">
            {on.length ? on.map((p) => p.name_ar).join(" · ") : "لم يُحدَّد أحد — اضغط للاختيار"}
          </span>
        </span>
        <span className="shrink-0 text-xs font-bold text-muted-foreground">{open ? "إخفاء" : "تعديل"}</span>
      </button>

      {open && (
        <div className="mt-2.5 flex flex-wrap gap-2 border-t border-border pt-2.5">
          {people.map((p) => (
            <button
              key={p.id}
              onClick={() => void toggle(p.id)}
              disabled={busy === p.id}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 px-3 text-sm font-black transition disabled:opacity-50 ${
                p.onDuty ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"
              }`}
            >
              {p.onDuty && <Check className="size-4" />}
              {p.name_ar}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
