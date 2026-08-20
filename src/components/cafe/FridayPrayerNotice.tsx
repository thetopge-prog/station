"use client";

import { useEffect, useState } from "react";

/** Friday selling-prohibition reminder for the cashier: from 10 min before
 *  Dhuhr until 20 min after, on Fridays only. Dhuhr ≈ solar noon for Ramadi/Iraq
 *  (lat 33.4°N, lon 43.3°E, UTC+3, no DST) — accurate to a few minutes, well
 *  within the 30-minute window. Recomputed every 30s. */
function inProhibitedWindow(): boolean {
  const now = new Date();
  // evaluate in Baghdad time regardless of the device clock's timezone
  const bg = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Baghdad" }));
  if (bg.getDay() !== 5) return false; // 5 = Friday

  const yearStart = new Date(bg.getFullYear(), 0, 0);
  const doy = Math.floor((bg.getTime() - yearStart.getTime()) / 86_400_000);
  const B = (2 * Math.PI * (doy - 81)) / 364;
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // equation of time (min)
  const lon = 43.3;
  const tz = 3;
  // +5 min calibration: solar-noon formula gave 12:12 vs the Ramadi adhan 12:17
  // (2026-08-10). This constant offset (zenith→adhan convention) holds ~year-round;
  // the formula still tracks the daily/seasonal drift.
  const dhuhr = (12 + tz - lon / 15 - eot / 60) * 60 + 5; // minutes since local midnight
  const mins = bg.getHours() * 60 + bg.getMinutes();
  return mins >= dhuhr - 10 && mins <= dhuhr + 20;
}

export function FridayPrayerNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const check = () => setShow(inProhibitedWindow());
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, []);

  if (!show) return null;
  return (
    <div dir="rtl" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-6">
      <div className="max-w-xl rounded-3xl border-4 border-red-600 bg-[#2a0d0d] p-8 text-center text-white shadow-2xl">
        <div className="text-6xl">🕌</div>
        <h2 className="mt-3 text-3xl font-extrabold text-red-400">تنبيه: البيع محرّم في هذا الوقت</h2>
        <p className="mt-4 text-xl font-bold leading-relaxed">
          ﴿يَا أَيُّهَا الَّذِينَ آمَنُوا إِذَا نُودِيَ لِلصَّلَاةِ مِنْ يَوْمِ الْجُمُعَةِ فَاسْعَوْا إِلَىٰ ذِكْرِ اللَّهِ وَذَرُوا الْبَيْعَ﴾
        </p>
        <p className="mt-2 text-sm text-red-200">[سورة الجمعة: ٩]</p>
        <p className="mt-4 leading-relaxed text-red-100/90">
          فلا يجوز البيع والشراء وقت صلاة الجمعة، بل يجب التفرّغ للعبادة والمبادرة لصلاة الجمعة.
        </p>
      </div>
    </div>
  );
}
