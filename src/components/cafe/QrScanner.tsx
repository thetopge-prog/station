"use client";

import { useEffect, useRef, useState } from "react";
import { chimeReady } from "@/lib/cafe/chime";

/**
 * Camera QR scanner — nimiq's qr-scanner.
 *
 * Every other app read the assembly ticket first time; the previous decoder
 * (zxing, generic, front camera by default) needed tries. This one is built
 * for phone cameras: it uses the browser's own hardware-accelerated
 * BarcodeDetector where the device has it (Android Chrome), a worker-based
 * decoder elsewhere, prefers the rear camera, draws the code's outline on
 * the preview so the expediter sees it lock, and has the torch built in.
 * Started only after an explicit tap (getUserMedia needs HTTPS + a gesture).
 *
 * The decoded text is shown LARGE the instant it is read — «908-73S» — so
 * the person sees what the machine saw, before the screen does anything.
 */
export function QrScanner({ onScan, onClose, title = "امسح بطاقة الولاء" }: { onScan: (text: string) => void; onClose: () => void; title?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<"none" | "off" | "on">("none");
  const [read, setRead] = useState<string | null>(null);
  const scannerRef = useRef<{ toggleFlash: () => Promise<void>; isFlashOn: () => boolean; stop: () => void; destroy: () => void } | null>(null);

  useEffect(() => {
    let stopped = false;
    let scanner: (typeof scannerRef)["current"] = null;
    (async () => {
      try {
        const { default: QrScanner } = await import("qr-scanner");
        const video = videoRef.current;
        if (!video) return;
        const s = new QrScanner(
          video,
          (result) => {
            if (stopped) return;
            stopped = true;
            setRead(result.data);
            chimeReady();
            s.stop();
            // a beat so the number is seen on screen before the sheet closes
            setTimeout(() => onScan(result.data), 350);
          },
          {
            preferredCamera: "environment",
            maxScansPerSecond: 15,
            highlightScanRegion: true,
            highlightCodeOutline: true,
            returnDetailedScanResult: true,
          },
        );
        scanner = s;
        scannerRef.current = s;
        await s.start();
        if (await s.hasFlash()) setFlash(s.isFlashOn() ? "on" : "off");
      } catch {
        setError("تعذّر تشغيل الكاميرا — اسمح للمتصفح بالكاميرا ثم أعد المحاولة.");
      }
    })();
    return () => {
      stopped = true;
      scanner?.stop();
      scanner?.destroy();
      scannerRef.current = null;
    };
  }, [onScan]);

  async function toggleFlash() {
    const s = scannerRef.current;
    if (!s) return;
    try {
      await s.toggleFlash();
      setFlash(s.isFlashOn() ? "on" : "off");
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
          <div className="relative">
            <video ref={videoRef} className="aspect-square w-full rounded-lg bg-black object-cover" />
            {read && (
              <div className="absolute inset-x-2 bottom-2 rounded-xl bg-primary px-3 py-2 text-center text-3xl font-black text-primary-foreground shadow-station" dir="ltr">
                {read}
              </div>
            )}
          </div>
        )}
        <div className="flex gap-2">
          {flash !== "none" && (
            <button onClick={() => void toggleFlash()} className={`min-h-11 flex-1 rounded-lg border px-4 font-bold ${flash === "on" ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
              🔦 {flash === "on" ? "أطفئ الإضاءة" : "إضاءة"}
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
