"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Inbox, Printer, RefreshCw } from "lucide-react";
import { connectPrinter } from "@/lib/cafe/printer-actions";
import { agentPrinters, kickDrawer, printJobs, type AgentPrinter } from "@/lib/cafe/print-client";

/**
 * التركيب — أزرار فقط.
 *
 * لم يبقَ من التركيب إلا ربط الطابعات وفتح الدرج. وكل ما عدا ذلك (الشاشات،
 * ورموز QR، وهاتف المتصل، وحسابات الدخول) صار منجزاً أو انتقل إلى صفحته.
 *
 * والمركِّب يفعل شيئاً واحداً هنا: يضغط اسم الطابعة كما يراه ويندوز، فتُربط
 * وتخرج ورقة تثبت أنها هي. لا حقول عنوان ولا منافذ ولا نسخ — تلك تسكن
 * /printers لمن يحتاجها.
 */

export type SetupPrinter = {
  id: string;
  name_ar: string;
  kind: "receipt" | "station" | "expediter";
  station_name: string | null;
  share: string | null;
  host: string | null;
  is_active: boolean;
};

/** مجموعة تُربط بضغطة واحدة — قد تكون صفّين على جهاز واحد. */
type Group = { key: string; label: string; ids: string[]; share: string | null; ready: boolean };

/**
 * الكاشير والمجهّز صفّان في القاعدة وجهاز واحد على الطاولة.
 *
 * القاعدة تمنع أن يحمل صفّ receipt محطةً (قيد printers_station_match)، فالتذكرة
 * والإيصال لا يمكن أن يكونا صفّاً واحداً — لكنهما يحملان المشاركة نفسها. فيُعرضان
 * زرّاً واحداً، لأن الذي يقف أمام الجهاز يرى جهازاً واحداً.
 */
export function groupPrinters(printers: SetupPrinter[]): Group[] {
  const till = printers.filter((p) => p.kind === "receipt" || p.kind === "expediter");
  const groups: Group[] = [];

  if (till.length > 0) {
    groups.push({
      key: "till",
      label: "طابعة الكاشير و المجهّز",
      ids: till.map((p) => p.id),
      share: till.find((p) => p.share)?.share ?? null,
      ready: till.every((p) => p.is_active && (p.share || p.host)),
    });
  }

  for (const p of printers.filter((x) => x.kind === "station")) {
    groups.push({
      key: p.id,
      label: `طابعة ${p.station_name ?? p.name_ar}`,
      ids: [p.id],
      share: p.share,
      ready: p.is_active && !!(p.share || p.host),
    });
  }
  return groups;
}

export function SetupClient({ printers }: { printers: SetupPrinter[] }) {
  const [found, setFound] = useState<AgentPrinter[]>([]);
  const [agentUp, setAgentUp] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<Record<string, string>>({});

  const scan = useCallback(async () => {
    setAgentUp(null);
    const list = await agentPrinters();
    setFound(list);
    setAgentUp(list.length > 0);
  }, []);

  // مؤجَّل بنبضة لا منادى في جسم التأثير: scan تضبط الحالة فوراً، و React 19
  // يعدّ setState متزامناً داخل تأثير رسماً متتالياً. نفس الحيلة المستعملة في
  // QueueDisplayClient لنفس السبب.
  useEffect(() => {
    const t = setTimeout(() => void scan(), 0);
    return () => clearTimeout(t);
  }, [scan]);

  const groups = groupPrinters(printers);

  async function connect(g: Group, share: string) {
    setBusy(g.key);
    setSaid((s) => ({ ...s, [g.key]: "" }));
    try {
      const res = await connectPrinter(g.ids, share);
      if (!res.ok) {
        setSaid((s) => ({ ...s, [g.key]: res.error }));
        return;
      }
      if (!res.job) {
        setSaid((s) => ({ ...s, [g.key]: "رُبطت — لكن تعذّر بناء ورقة الفحص." }));
        return;
      }
      const out = await printJobs([res.job]);
      // out.sent يعني «الوكيل قَبِلها» منذ أن صار الردّ يُقرأ، لا «غادرت المتصفح»
      setSaid((s) => ({
        ...s,
        [g.key]: out.sent > 0 ? `رُبطت بـ${share} — اخرج الورقة ✓` : "رُبطت، لكن الطابعة لم تستجب.",
      }));
    } catch {
      setSaid((s) => ({ ...s, [g.key]: "تعذّر الاتصال بوكيل الطباعة." }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-black">التركيب</h1>
        <button onClick={() => void scan()} className="touch-pos flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-bold hover:bg-secondary">
          <RefreshCw className="size-4" />
          إعادة الفحص
        </button>
      </header>

      {agentUp === false && (
        <p className="rounded-2xl border-2 border-destructive bg-destructive/10 p-4 text-sm font-bold text-destructive">
          وكيل الطباعة لا يستجيب على هذا الجهاز. شغّله أولاً — بدونه لا يُربط شيء.
        </p>
      )}

      {groups.map((g) => (
        <section key={g.key} className={`rounded-2xl border-2 p-4 ${g.ready ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-black">
              <Printer className="size-5" />
              {g.label}
            </h2>
            {g.ready && (
              <span className="flex items-center gap-1 text-sm font-black text-primary">
                <Check className="size-4" />
                {g.share}
              </span>
            )}
          </div>

          {/* أسماء ويندوز كما هي. أربع طابعات على هذا الجهاز أسماؤها POS80 و
              POS80-25 و POS-24 و POS-23 — حرفان بينها، وخطأٌ في النسخ يرسل
              البرجر إلى فرن البيتزا ولا يكتشفه أحد حتى يشتكي زبون. */}
          <div className="flex flex-wrap gap-2">
            {found.length === 0 && <p className="text-sm font-bold text-muted-foreground">لا توجد طابعات مكتشفة.</p>}
            {found.map((f) => {
              const share = f.share || f.name;
              return (
                <button
                  key={f.name}
                  disabled={busy === g.key}
                  onClick={() => void connect(g, share)}
                  className={`touch-pos rounded-xl border-2 px-3 py-2 text-sm font-bold transition disabled:opacity-50 ${
                    g.share === share ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-secondary"
                  }`}
                >
                  {busy === g.key ? "…" : share}
                </button>
              );
            })}
          </div>

          {said[g.key] && <p className="mt-2 text-sm font-black text-primary">{said[g.key]}</p>}
        </section>
      ))}

      <section className="rounded-2xl border-2 border-border bg-card p-4">
        <h2 className="mb-2 flex items-center gap-2 font-black">
          <Inbox className="size-5" />
          الدرج
        </h2>
        <button
          onClick={() => void kickDrawer()}
          className="touch-pos w-full rounded-xl bg-primary px-4 py-3 font-black text-primary-foreground hover:opacity-90"
        >
          افتح الدرج
        </button>
        <p className="mt-2 text-xs font-bold text-muted-foreground">
          الدرج يُفتح من طابعة الكاشير، فاربطها أولاً.
        </p>
      </section>
    </div>
  );
}
