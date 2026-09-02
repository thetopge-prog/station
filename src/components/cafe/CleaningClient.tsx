"use client";

import { useCallback, useEffect, useState } from "react";
import { QrCode, Sparkles } from "lucide-react";
import {
  listCleaningTables,
  markTableClean,
  markTableDirty,
  resolveScannedTable,
  type CleaningTable,
} from "@/lib/cafe/prep-actions";
import { QrScanner } from "./QrScanner";

/**
 * شاشة تنظيف الطاولات — a phone screen, used standing up, one hand.
 *
 * Two ways in, because a scanner is faster when it works and useless when the
 * sticker is greasy or the light is bad:
 *   · scan the table QR that /qr already prints (no new stickers needed), or
 *   · tap the table in the list.
 *
 * Dirty tables sort first and fill the screen — the crew should never have to
 * hunt for their work.
 */
export function CleaningClient() {
  const [tables, setTables] = useState<CleaningTable[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setTables(await listCleaningTables());
      setLoaded(true);
    } catch {
      /* keep the last good list */
    }
  }, []);

  useEffect(() => {
    const kick = setTimeout(() => void refresh(), 0);
    const poll = setInterval(() => void refresh(), 10_000);
    return () => {
      clearTimeout(kick);
      clearInterval(poll);
    };
  }, [refresh]);

  // clear the toast after a few seconds without a timer per render
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);

  const clean = useCallback(
    async (name: string) => {
      setBusy(name);
      try {
        const res = await markTableClean(name);
        setMsg(res.ok ? { kind: "ok", text: `طاولة ${name} جاهزة ✅` } : { kind: "err", text: res.error });
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const onScanned = useCallback(
    async (text: string) => {
      setScanOpen(false);
      const name = await resolveScannedTable(text);
      if (!name) {
        setMsg({ kind: "err", text: "لم يتم التعرّف على الطاولة من الرمز." });
        return;
      }
      await clean(name);
    },
    [clean],
  );

  const dirty = tables.filter((t) => t.clean_status === "dirty");
  const ready = tables.filter((t) => t.clean_status !== "dirty");

  return (
    <div className="touch-pos mx-auto max-w-2xl space-y-5 pb-24">
      <header>
        <h1 className="text-2xl font-black">تنظيف الطاولات</h1>
        <p className="text-sm font-bold text-muted-foreground">
          {dirty.length > 0 ? `${dirty.length} طاولة تحتاج تنظيف` : "كل الطاولات جاهزة"}
        </p>
      </header>

      {msg && (
        <p
          className={`rounded-2xl border-2 px-4 py-3 text-center font-black ${
            msg.kind === "ok" ? "border-primary bg-primary/10 text-primary" : "border-destructive bg-destructive/10 text-destructive"
          }`}
        >
          {msg.text}
        </p>
      )}

      {!loaded ? (
        <p className="rounded-2xl border-2 border-dashed border-border p-10 text-center font-bold text-muted-foreground">…</p>
      ) : (
        <>
          {dirty.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-lg font-black text-destructive">تحتاج تنظيف</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {dirty.map((t) => (
                  <button
                    key={t.name}
                    onClick={() => void clean(t.name)}
                    disabled={busy === t.name}
                    className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-destructive bg-destructive/5 p-3 font-black transition active:scale-95 disabled:opacity-50"
                  >
                    <span className="text-2xl">{t.name}</span>
                    <span className="flex items-center gap-1 text-xs text-destructive">
                      <Sparkles className="size-3.5" />
                      {busy === t.name ? "…" : "اضغط بعد التنظيف"}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-2">
            <h2 className="text-lg font-black text-muted-foreground">جاهزة</h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {ready.map((t) => (
                <button
                  key={t.name}
                  onClick={() => void markTableDirty(t.name).then(refresh)}
                  title="وضع علامة تحتاج تنظيف"
                  className="min-h-16 rounded-2xl border-2 border-border bg-card p-2 font-black transition hover:bg-secondary active:scale-95"
                >
                  {t.name}
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {/* thumb-reachable on a phone, which is where this screen lives */}
      <button
        onClick={() => setScanOpen(true)}
        className="fixed inset-x-4 bottom-4 z-40 mx-auto flex min-h-16 max-w-md items-center justify-center gap-3 rounded-full bg-primary text-xl font-black text-primary-foreground shadow-station-lg"
      >
        <QrCode className="size-6" />
        مسح رمز الطاولة
      </button>

      {scanOpen && <QrScanner onScan={(t) => void onScanned(t)} onClose={() => setScanOpen(false)} />}
    </div>
  );
}
