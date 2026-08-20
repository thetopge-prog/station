"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** One-tap add-to-home-screen for the loyalty card. Android/Chrome fires
 *  beforeinstallprompt → native install dialog; elsewhere (iOS Safari has no
 *  API) the tap shows the manual steps instead. */
export function InstallCardButton() {
  const [bip, setBip] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault();
      setBip(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return <p className="rounded-lg bg-secondary px-3 py-2 text-sm font-semibold text-primary">✓ تمت إضافة البطاقة إلى شاشتك الرئيسية</p>;
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => {
          if (bip) void bip.prompt();
          else setShowHelp((v) => !v);
        }}
        className="w-full rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground transition hover:opacity-90"
      >
        📲 إضافة البطاقة إلى الشاشة الرئيسية
      </button>
      {showHelp && (
        <div className="space-y-1 rounded-lg bg-secondary px-3 py-2 text-right text-xs text-muted-foreground">
          <p>
            <b>آيفون (Safari):</b> زر المشاركة <span dir="ltr">⬆️</span> ثم «إضافة إلى الشاشة الرئيسية».
          </p>
          <p>
            <b>أندرويد (Chrome):</b> قائمة <span dir="ltr">⋮</span> ثم «إضافة إلى الشاشة الرئيسية».
          </p>
        </div>
      )}
    </div>
  );
}
