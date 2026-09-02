"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Hash, RefreshCw } from "lucide-react";
import { buildIdentifyJobs, connectPrinter } from "@/lib/cafe/printer-actions";
import { agentPrinters, printJobs, type AgentPrinter } from "@/lib/cafe/print-client";

/**
 * ربط الطابعات — الشاشة الوحيدة، وتُستعمل في /setup و /printers معاً.
 *
 * كانت هناك شاشتان: صفحة تركيب بأزرار، وصفحة طابعات بحقول عنوان IP ومنفذ
 * وعدد نسخ لكل جهاز. وصاحب المحل قال عن الثانية: «هذه غير مفهومة لي، والآيبي
 * كيف أدخله؟».
 *
 * والجواب أنه لا يُدخله. طابعات هذا المحل موصولة بجهاز الكاشير نفسه، فويندوز
 * يعرفها والوكيل يسألها. حقول العنوان لم تكن تحمل قيماً أصلاً — كانت أمثلة
 * رمادية تُقرأ كأنها بيانات. ولا تلزم إلا طابعةَ شبكةٍ لا يملك المحل واحدة.
 */

export type ConnectRow = {
  id: string;
  name_ar: string;
  kind: "receipt" | "station" | "expediter";
  station_name: string | null;
  share: string | null;
  host: string | null;
  is_active: boolean;
};

type Group = { key: string; label: string; ids: string[]; share: string | null; ready: boolean };

/**
 * الكاشير والمجهّز صفّان في القاعدة وجهاز واحد على الطاولة.
 *
 * القاعدة تمنع أن يحمل صفّ receipt محطةً، فلا يمكن دمجهما — لكنهما يحملان
 * المشاركة نفسها. فيُعرضان زرّاً واحداً، لأن الواقف أمام الجهاز يرى جهازاً.
 */
export function groupPrinters(printers: ConnectRow[]): Group[] {
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

export function PrinterConnect({ printers, canEdit = true }: { printers: ConnectRow[]; canEdit?: boolean }) {
  const [found, setFound] = useState<AgentPrinter[]>([]);
  const [agentUp, setAgentUp] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<Record<string, string>>({});
  const [numbered, setNumbered] = useState(false);

  const scan = useCallback(async () => {
    const list = await agentPrinters();
    setFound(list);
    setAgentUp(list.length > 0);
  }, []);

  // مؤجَّل بنبضة: setState متزامناً داخل تأثير يعدّه React 19 رسماً متتالياً
  useEffect(() => {
    const t = setTimeout(() => void scan(), 0);
    return () => clearTimeout(t);
  }, [scan]);

  const groups = groupPrinters(printers);
  const shares = found.map((f) => f.share || f.name);

  /**
   * يطبع رقماً على كل طابعة، فتعرّف نفسها بنفسها.
   *
   * أسماء ويندوز هنا POS80 و POS80-25 و POS-24: حرفان بينها، وكل طابعة في غرفة
   * أخرى. اختيارها من قائمة تخمينٌ لا ربط. أما الورقة فلا تخمّن.
   */
  async function identify() {
    setBusy("identify");
    try {
      const out = await printJobs(await buildIdentifyJobs(shares));
      setNumbered(out.sent > 0);
      setSaid((s) => ({
        ...s,
        identify: out.sent > 0 ? "خرجت الأوراق — امشِ واقرأ الرقم عند كل مطبخ." : "لم تستجب أي طابعة.",
      }));
    } catch {
      setSaid((s) => ({ ...s, identify: "تعذّر الاتصال بوكيل الطباعة." }));
    } finally {
      setBusy(null);
    }
  }

  async function connect(g: Group, share: string) {
    setBusy(g.key);
    setSaid((s) => ({ ...s, [g.key]: "" }));
    try {
      const res = await connectPrinter(g.ids, share);
      if (!res.ok) return setSaid((s) => ({ ...s, [g.key]: res.error }));
      const out = res.job ? await printJobs([res.job]) : { sent: 0 };
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
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => void identify()}
          disabled={!canEdit || busy !== null || shares.length === 0}
          className="touch-pos flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-black text-primary-foreground disabled:opacity-50"
        >
          <Hash className="size-4" />
          {busy === "identify" ? "…" : "اطبع أرقام التعريف"}
        </button>
        <button
          onClick={() => void scan()}
          className="touch-pos flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-bold hover:bg-secondary"
        >
          <RefreshCw className="size-4" />
          إعادة الفحص
        </button>
      </div>

      {said.identify && <p className="mb-3 text-sm font-black text-primary">{said.identify}</p>}

      {agentUp === false && (
        <p className="mb-3 rounded-xl border-2 border-destructive bg-destructive/10 p-3 text-sm font-bold text-destructive">
          وكيل الطباعة لا يستجيب على هذا الجهاز — شغّله من صفحة التركيب أولاً.
        </p>
      )}

      <div className="space-y-2">
        {groups.map((g) => (
          <div key={g.key} className={`rounded-xl border-2 p-3 ${g.ready ? "border-primary bg-primary/5" : "border-border"}`}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-black">{g.label}</span>
              {g.ready && (
                <span className="flex items-center gap-1 text-sm font-black text-primary">
                  <Check className="size-4" />
                  {g.share}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {shares.length === 0 && <p className="text-sm font-bold text-muted-foreground">لا توجد طابعات مكتشفة.</p>}
              {shares.map((share, i) => (
                <button
                  key={share}
                  disabled={!canEdit || busy !== null}
                  onClick={() => void connect(g, share)}
                  title={share}
                  className={`touch-pos rounded-xl border-2 px-3 py-2 text-sm font-black transition disabled:opacity-50 ${
                    g.share === share ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-secondary"
                  }`}
                >
                  {/* الرقم بعد الطباعة: هو ما بيد المركِّب حينها، لا الاسم */}
                  {numbered ? `${i + 1}` : share}
                </button>
              ))}
            </div>
            {said[g.key] && <p className="mt-2 text-sm font-black text-primary">{said[g.key]}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
