"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Camera QR scanner (@zxing/browser — works on iOS Safari where native
 * BarcodeDetector doesn't exist). Started only after an explicit user tap
 * (getUserMedia requires HTTPS/localhost + a gesture). Parent should offer a
 * manual serial-entry fallback for denied cameras.
 */
export function QrScanner({ onScan, onClose }: { onScan: (text: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let controls: { stop: () => void } | null = null;
    (async () => {
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const reader = new BrowserQRCodeReader();
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result) => {
          if (result && !stopped) {
            stopped = true;
            controls?.stop();
            onScan(result.getText());
          }
        });
      } catch {
        setError("تعذّر تشغيل الكاميرا — أدخل رقم البطاقة يدوياً.");
      }
    })();
    return () => {
      stopped = true;
      controls?.stop();
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-sm space-y-3 rounded-2xl bg-card p-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold">امسح بطاقة الولاء</h3>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <video ref={videoRef} className="aspect-square w-full rounded-lg bg-black object-cover" />
        )}
        <button onClick={onClose} className="w-full rounded-lg border border-border px-4 py-2 font-medium hover:bg-secondary">
          إغلاق
        </button>
      </div>
    </div>
  );
}
