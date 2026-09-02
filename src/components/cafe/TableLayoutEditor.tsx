"use client";

import { useRef, useState } from "react";
import { saveTables } from "@/lib/cafe/table-actions";
import { tableLabel, type CafeTable } from "@/lib/cafe/tables";

const clamp = (n: number) => Math.max(4, Math.min(96, n));
const TAP_SLOP = 6; // px of finger jitter still counts as a tap, not a drag

function gridPos(kind: "indoor" | "outdoor", i: number) {
  if (kind === "outdoor") return { x: 22 + ((i - 1) % 3) * 26, y: 84 };
  return { x: 12 + ((i - 1) % 4) * 22, y: 10 + Math.floor((i - 1) / 4) * 17 };
}

/** Floor-plan editor: pick indoor/outdoor counts, drag tables to match the real
 *  layout, toggle each active, and save. Touch-friendly (pointer events). */
export function TableLayoutEditor({
  initial,
  onSaved,
  onCancel,
}: {
  initial: CafeTable[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [tables, setTables] = useState<CafeTable[]>(initial);
  const [indoor, setIndoor] = useState(initial.filter((t) => t.kind === "indoor").length || 12);
  const [outdoor, setOutdoor] = useState(initial.filter((t) => t.kind === "outdoor").length || 2);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const areaRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ name: string; dx: number; dy: number; startX: number; startY: number; moved: boolean } | null>(null);

  function generate() {
    const next: CafeTable[] = [];
    for (let i = 1; i <= indoor; i++) {
      const name = String(i);
      next.push(tables.find((t) => t.name === name) ?? { name, kind: "indoor", active: true, ...gridPos("indoor", i) });
    }
    for (let i = 1; i <= outdoor; i++) {
      const name = `خارجي ${i}`;
      next.push(tables.find((t) => t.name === name) ?? { name, kind: "outdoor", active: true, ...gridPos("outdoor", i) });
    }
    setTables(next);
  }

  function onDown(e: React.PointerEvent, name: string) {
    const area = areaRef.current?.getBoundingClientRect();
    const t = tables.find((x) => x.name === name);
    if (!area || !t) return;
    drag.current = {
      name,
      dx: e.clientX - (area.left + (t.x / 100) * area.width),
      dy: e.clientY - (area.top + (t.y / 100) * area.height),
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    const area = areaRef.current?.getBoundingClientRect();
    if (!d || !area || e.buttons === 0) return; // ignore stray hover moves (no button/finger down)
    // only treat as a drag once past the tap slop, so a jittery tap still toggles
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < TAP_SLOP) return;
    d.moved = true;
    const x = clamp(((e.clientX - d.dx - area.left) / area.width) * 100);
    const y = clamp(((e.clientY - d.dy - area.top) / area.height) * 100);
    setTables((ts) => ts.map((t) => (t.name === d.name ? { ...t, x, y } : t)));
  }
  function onUp(name: string) {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) setTables((ts) => ts.map((t) => (t.name === name ? { ...t, active: !t.active } : t))); // tap toggles active
  }
  function onDragCancel() {
    drag.current = null; // interrupted drag (system gesture / lost capture) — drop stale state
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await saveTables(tables);
    setBusy(false);
    if (res.ok) onSaved();
    else setMsg(res.error);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">طاولات داخلية</span>
          <input type="number" min={0} max={40} value={indoor} onChange={(e) => setIndoor(Math.max(0, Math.min(40, Number(e.target.value) || 0)))} className="w-24 rounded-lg border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" dir="ltr" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">طاولات خارجية</span>
          <input type="number" min={0} max={20} value={outdoor} onChange={(e) => setOutdoor(Math.max(0, Math.min(20, Number(e.target.value) || 0)))} className="w-24 rounded-lg border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" dir="ltr" />
        </label>
        <button onClick={generate} className="rounded-lg bg-secondary px-4 py-2 text-sm font-semibold hover:opacity-90">
          ضبط وتنظيم
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        اسحب الطاولة لتضعها في مكانها كما في المطعم. اضغط على الطاولة ضغطة واحدة لتفعيلها/تعطيلها (المعطّلة رمادية ولا تظهر للطلب).
      </p>

      <div
        ref={areaRef}
        onPointerMove={onMove}
        className="relative h-[62vh] min-h-[380px] w-full touch-none overflow-hidden rounded-2xl border-2 border-dashed border-border bg-secondary/30"
      >
        <span className="pointer-events-none absolute right-3 top-2 text-xs text-muted-foreground">🚪 واجهة المحل</span>
        {tables.map((t) => (
          <button
            key={t.name}
            onPointerDown={(e) => onDown(e, t.name)}
            onPointerUp={() => onUp(t.name)}
            onPointerCancel={onDragCancel}
            onLostPointerCapture={onDragCancel}
            style={{ left: `${t.x}%`, top: `${t.y}%`, transform: "translate(-50%, -50%)" }}
            className={`absolute flex size-16 touch-none flex-col items-center justify-center rounded-xl border-2 text-center text-xs font-bold shadow transition ${
              t.active
                ? t.kind === "outdoor"
                  ? "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  : "border-primary bg-primary/15 text-primary"
                : "border-border bg-muted text-muted-foreground opacity-50"
            }`}
          >
            <span className="leading-tight">{tableLabel(t.name)}</span>
            {!t.active && <span className="text-[9px]">معطّلة</span>}
          </button>
        ))}
        {tables.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">حدّد العدد ثم اضغط «ضبط وتنظيم».</p>
        )}
      </div>

      {msg && <p className="text-sm text-destructive">{msg}</p>}
      <div className="flex flex-wrap gap-2">
        <button onClick={save} disabled={busy} className="rounded-xl bg-primary px-6 py-2.5 font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
          {busy ? "…" : "💾 حفظ التنظيم"}
        </button>
        <button onClick={onCancel} className="rounded-xl border border-border px-6 py-2.5 font-semibold hover:bg-secondary">
          إلغاء
        </button>
      </div>
    </div>
  );
}
