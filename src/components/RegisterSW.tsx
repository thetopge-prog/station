"use client";

import { useEffect } from "react";

/**
 * Register the service worker for every visitor, not just staff with push on.
 *
 * It used to be registered inside StaffShell, and only when a VAPID key was
 * configured. So a shop with no push notifications set up had no service
 * worker at all — which meant no asset cache and, more visibly, no «إضافة إلى
 * الشاشة الرئيسية»: Chrome refuses to install an app whose worker has no fetch
 * handler, and there was no worker to have one.
 *
 * The customer menu is the screen that benefits most. It is opened on a tablet
 * over shop Wi-Fi, and it is mostly photographs.
 */
export function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // after load: registration competes with the first paint for the same
    // connection, and the first paint matters more
    const go = () => void navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
    return () => window.removeEventListener("load", go);
  }, []);

  return null;
}
