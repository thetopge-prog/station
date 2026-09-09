"use client";

import { useEffect, useRef } from "react";
import { agentAlive, printJobs } from "@/lib/cafe/print-client";
import { buildOrderJobs } from "@/lib/cafe/printer-actions";
import { claimPrint, listUnprinted, releasePrint } from "@/lib/cafe/print-spool-actions";

/**
 * يلتقط الطلبات المدفوعة التي لم تُطبع ويطبعها — على الجهاز الذي عنده طابعة.
 *
 * يُركَّب على كل شاشة موظّف ولا يفعل شيئاً إلا حيث يجيب وكيل الطباعة
 * (حاسوب الكاشير). موبايل الكاشير في البيت، أو تابلت النادل، أو البوت: يُدخل
 * الطلب، ويصل المطبخ ورقةً من هنا خلال ثوانٍ. لا يرسم شيئاً.
 */
export function PrintSpooler() {
  const busy = useRef(false);

  useEffect(() => {
    let alive = false;
    let stop = false;

    const check = async () => {
      alive = await agentAlive(900);
    };
    const tick = async () => {
      if (stop || !alive || busy.current) return;
      busy.current = true;
      try {
        const due = await listUnprinted();
        for (const o of due) {
          if (stop) break;
          if (!(await claimPrint(o.id))) continue; // جهاز آخر سبق
          try {
            const { jobs } = await buildOrderJobs(o.id);
            const out = jobs.length ? await printJobs(jobs) : { sent: 0, queued: 0 };
            // لم تخرج ورقة واحدة: أعده إلى الطابور ليُلتقط حين تعود الطابعة
            if (out.sent === 0) await releasePrint(o.id);
          } catch {
            await releasePrint(o.id).catch(() => {});
          }
        }
      } catch {
        /* الاستطلاع القادم يعوّض */
      } finally {
        busy.current = false;
      }
    };

    const kick = setTimeout(() => void check().then(tick), 1500);
    const poll = setInterval(() => void tick(), 5000);
    const recheck = setInterval(() => void check(), 60_000);
    return () => {
      stop = true;
      clearTimeout(kick);
      clearInterval(poll);
      clearInterval(recheck);
    };
  }, []);

  return null;
}
