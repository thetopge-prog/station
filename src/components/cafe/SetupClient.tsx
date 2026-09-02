"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Check, Hash, Inbox, Monitor, Printer, RefreshCw, Terminal } from "lucide-react";
import { buildIdentifyJobs, connectPrinter } from "@/lib/cafe/printer-actions";
import { agentPrinters, kickDrawer, printJobs, type AgentPrinter } from "@/lib/cafe/print-client";
import { CopyButton } from "./CopyButton";

/**
 * التركيب — أربعة أفعال.
 *
 * شغّل السكربت · اربط الطابعات · افتح الشاشات · جرّب الدرج. لا شروح ولا قوائم
 * فحص؛ كل قسم شيء يُفعل ويُرى أثره فوراً.
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

export type ScreenLink = { title: string; note: string; path: string; url: string; qr: string };

type Group = { key: string; label: string; ids: string[]; share: string | null; ready: boolean };

/**
 * الكاشير والمجهّز صفّان في القاعدة وجهاز واحد على الطاولة.
 *
 * القاعدة تمنع أن يحمل صفّ receipt محطةً، فلا يمكن دمجهما صفّاً واحداً — لكنهما
 * يحملان المشاركة نفسها. فيُعرضان زرّاً واحداً، لأن الواقف أمام الجهاز يرى جهازاً.
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

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border-2 border-border bg-card p-4">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-black">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

export function SetupClient({
  printers,
  screens,
  installCommand,
}: {
  printers: SetupPrinter[];
  screens: ScreenLink[];
  installCommand: string;
}) {
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

  useEffect(() => {
    const t = setTimeout(() => void scan(), 0);
    return () => clearTimeout(t);
  }, [scan]);

  const groups = groupPrinters(printers);
  const shares = found.map((f) => f.share || f.name);

  /**
   * يطبع رقماً على كل طابعة، فتعرّف نفسها بنفسها.
   *
   * أسماء ويندوز هنا POS80 و POS80-25 و POS-24: حرفان بينها، وكل طابعة في غرفة.
   * اختيارها من قائمة تخمينٌ لا ربط. أما الورقة فلا تكذب — يمشي المركِّب، يرى
   * الرقم الخارج عند فرن البيتزا، ويضغطه.
   */
  async function identify() {
    setBusy("identify");
    try {
      const jobs = await buildIdentifyJobs(shares);
      const out = await printJobs(jobs);
      setNumbered(out.sent > 0);
      setSaid((s) => ({
        ...s,
        identify: out.sent > 0 ? "خرجت الأوراق — امشِ واقرأ الرقم عند كل مطبخ." : "لم تستجب أي طابعة.",
      }));
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
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-black">التركيب</h1>

      <Section icon={<Terminal className="size-5" />} title="١ — شغّل هذا على جهاز الكاشير">
        <div className="flex items-start gap-2">
          <code className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-secondary p-3 text-left text-xs" dir="ltr">
            {installCommand}
          </code>
          <CopyButton value={installCommand} />
        </div>
        <p className="mt-2 text-xs font-bold text-muted-foreground">
          PowerShell كمسؤول. يُنصّب وكيل الطباعة ويشغّله مع الإقلاع. لا يمسّ النظام القديم.
        </p>
      </Section>

      <Section icon={<Printer className="size-5" />} title="٢ — اربط الطابعات">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => void identify()}
            disabled={busy !== null || shares.length === 0}
            className="touch-pos flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-black text-primary-foreground disabled:opacity-50"
          >
            <Hash className="size-4" />
            {busy === "identify" ? "…" : "اطبع أرقام التعريف"}
          </button>
          <button onClick={() => void scan()} className="touch-pos flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-bold hover:bg-secondary">
            <RefreshCw className="size-4" />
            إعادة الفحص
          </button>
        </div>
        {said.identify && <p className="mb-3 text-sm font-black text-primary">{said.identify}</p>}
        {agentUp === false && (
          <p className="mb-3 rounded-xl border-2 border-destructive bg-destructive/10 p-3 text-sm font-bold text-destructive">
            وكيل الطباعة لا يستجيب — نفّذ الخطوة ١ أولاً.
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
                    disabled={busy !== null}
                    onClick={() => void connect(g, share)}
                    title={share}
                    className={`touch-pos rounded-xl border-2 px-3 py-2 text-sm font-black transition disabled:opacity-50 ${
                      g.share === share ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-secondary"
                    }`}
                  >
                    {/* الرقم أولاً بعد الطباعة: هو ما بيد المركِّب، لا الاسم */}
                    {numbered ? `${i + 1}` : share}
                  </button>
                ))}
              </div>
              {said[g.key] && <p className="mt-2 text-sm font-black text-primary">{said[g.key]}</p>}
            </div>
          ))}
        </div>
      </Section>

      <Section icon={<Monitor className="size-5" />} title="٣ — افتح الشاشات">
        <div className="grid gap-3 sm:grid-cols-2">
          {screens.map((s) => (
            <div key={s.path} className="rounded-xl border border-border p-3 text-center">
              <p className="font-black">{s.title}</p>
              <p className="mb-2 text-xs font-bold text-muted-foreground">{s.note}</p>
              <Image src={s.qr} alt={s.title} width={110} height={110} className="mx-auto rounded-lg" unoptimized />
              <div className="mt-2 flex items-center justify-center gap-1">
                <code className="truncate text-[11px]" dir="ltr">{s.url}</code>
                <CopyButton value={s.url} />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section icon={<Inbox className="size-5" />} title="٤ — الدرج">
        <button
          onClick={() => void kickDrawer()}
          className="touch-pos w-full rounded-xl bg-primary px-4 py-3 font-black text-primary-foreground hover:opacity-90"
        >
          افتح الدرج
        </button>
        <p className="mt-2 text-xs font-bold text-muted-foreground">يُفتح من طابعة الكاشير، فاربطها أولاً.</p>
      </Section>
    </div>
  );
}
