"use client";

import { useEffect, useRef, useState } from "react";
import { chimeReady } from "@/lib/cafe/chime";

/**
 * Camera QR scanner (@zxing/browser — works on iOS Safari where native
 * BarcodeDetector doesn't exist). Started only after an explicit user tap
 * (getUserMedia requires HTTPS/localhost + a gesture). Parent should offer a
 * manual serial-entry fallback for denied cameras.
 *
 * Any other app read the assembly ticket first time; this one needed tries.
 * It opened whatever camera the browser handed it — on a tablet the FRONT one,
 * low-res and mirrored — with no size hint and the fast decoder. Now: the rear
 * camera, 720p, TRY_HARDER, QR only, a torch where the device has one, and a
 * chime so the expediter hears the read instead of looking for it.
 */
export function QrScanner({ onScan, onClose, title = "امسح بطاقة الولاء" }: { onScan: (text: string) => void; onClose: () => void; title?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [torch, setTorch] = useState<"none" | "off" | "on">("none");
  const trackRef = useRef<MediaStreamTrack | null>(null);

  useEffect(() => {
    let stopped = false;
    let controls: { stop: () => void } | null = null;
    (async () => {
      try {
        const [{ BrowserQRCodeReader }, lib] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
        const hints = new Map();
        hints.set(lib.DecodeHintType.TRY_HARDER, true);
        hints.set(lib.DecodeHintType.POSSIBLE_FORMATS, [lib.BarcodeFormat.QR_CODE]);
        const reader = new BrowserQRCodeReader(hints, { delayBetweenScanAttempts: 150 });
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          videoRef.current ?? undefined,
          (result) => {
            if (result && !stopped) {
              stopped = true;
              controls?.stop();
              chimeReady();
              onScan(result.getText());
            }
          },
        );
        // torch: only some rear cameras expose it; the button appears when they do
        const stream = videoRef.current?.srcObject as MediaStream | null;
        const track = stream?.getVideoTracks()[0] ?? null;
        trackRef.current = track;
        const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
        if (caps?.torch) setTorch("off");
      } catch {
        setError("تعذّر تشغيل الكاميرا — اسمح للمتصفح بالكاميرا ثم أعد المحاولة.");
      }
    })();
    return () => {
      stopped = true;
      controls?.stop();
    };
  }, [onScan]);

  async function toggleTorch() {
    const t = trackRef.current;
    if (!t) return;
    const next = torch !== "on";
    try {
      await t.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorch(next ? "on" : "off");
    } catch {
      /* the device said no; the button stays as it was */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-sm space-y-3 rounded-2xl bg-card p-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold">{title}</h3>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <video ref={videoRef} className="aspect-square w-full rounded-lg bg-black object-cover" />
        )}
        <div className="flex gap-2">
          {torch !== "none" && (
            <button onClick={() => void toggleTorch()} className={`min-h-11 flex-1 rounded-lg border px-4 font-bold ${torch === "on" ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
              🔦 {torch === "on" ? "أطفئ الإضاءة" : "إضاءة"}
            </button>
          )}
          <button onClick={onClose} className="min-h-11 flex-1 rounded-lg border border-border px-4 font-medium hover:bg-secondary">
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
