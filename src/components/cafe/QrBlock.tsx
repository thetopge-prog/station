"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * A QR rendered as an <img> so it survives printing.
 *
 * Generated client-side into a data URL: an <svg> or <canvas> is unreliable in
 * a print stylesheet across browsers, and a thermal printer driver rasterising
 * an inline canvas is exactly the kind of thing that prints blank. A data-URL
 * <img> is just an image, and images print.
 *
 * Rendered at 4x the display size and scaled down, because an 80mm thermal
 * printer at 203dpi will otherwise turn a 120px QR into an unscannable smudge.
 */
export function QrBlock({
  value,
  size = 120,
  label,
}: {
  value: string;
  size?: number;
  label?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, {
      width: size * 4,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#FFFFFF" },
    })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        /* a missing QR must never stop a receipt printing */
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!src) return null;
  return (
    <div style={{ textAlign: "center", marginTop: "6px" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={size} height={size} style={{ display: "inline-block" }} />
      {label && <div style={{ fontSize: "10px", marginTop: "2px" }}>{label}</div>}
    </div>
  );
}
