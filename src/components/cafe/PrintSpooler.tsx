"use client";

import { useEffect, useRef } from "react";
import { agentAlive, printJobs } from "@/lib/cafe/print-client";
import { buildOrderJobs } from "@/lib/cafe/printer-actions";
import { claimPrint, listUnprinted, releasePrint } from "@/lib/cafe/print-spool-actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * يلتقط الطلبات المدفوعة التي لم تُطبع ويطبعها — على الجهاز الذي عنده طابعة.
 *
 * يُركَّب على كل شاشة موظّف ولا يفعل شيئاً إلا حيث يجيب وكيل الطباعة
 * (حاسوب الكاشير). موبايل الكاشير في البيت، أو تابلت النادل، أو البوت: يُدخل
 * الطلب، ويصل المطبخ ورقةً من هنا في نحو ثانية — الحدث اللحظي من القاعدة
 * يوقظه، والاستطلاع كل ٣ ثوانٍ احتياط إن نام الاتصال. لا يرسم شيئاً.
 */
export function PrintSpooler() {
  const busy = useRef(false);

  useEffect(() => {
    let alive = false;
    let stop = false;
    let wake: ReturnType<typeof setTimeout> | null = null;

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
    // a paid order changes a row; the event arrives within a second — wait a
    // beat so the device that keyed it claims its own print first
    const soon = () => {
      if (wake) clearTimeout(wake);
      wake = setTimeout(() => void tick(), 700);
    };

    const kick = setTimeout(() => void check().then(tick), 1500);
    // كل نبضة استدعاء دالة على الخادم، وهذا المكوّن مركّب في كل شاشة موظّف:
    // ثلاث ثوانٍ = ٢٨٬٨٠٠ استدعاء يومياً لكل شاشة مفتوحة، وهي ما أوقف الموقع.
    // الاشتراك الحيّ (soon) يلتقط الطلب خلال ثانية، فهذا احتياط لا أكثر.
    const poll = setInterval(() => void tick(), 30_000);
    const recheck = setInterval(() => void check(), 60_000);

    let channel: ReturnType<ReturnType<typeof createSupabaseBrowserClient>["channel"]> | null = null;
    try {
      channel = createSupabaseBrowserClient()
        .channel("print-spooler")
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, soon)
        .subscribe();
    } catch {
      /* demo mode: the poll carries it */
    }
    return () => {
      stop = true;
      clearTimeout(kick);
      clearInterval(poll);
      clearInterval(recheck);
      if (wake) clearTimeout(wake);
      if (channel) void createSupabaseBrowserClient().removeChannel(channel);
    };
  }, []);

  return null;
}
