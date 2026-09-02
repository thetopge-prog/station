"use client";

import Image from "next/image";
import { Inbox, Monitor, Printer, Terminal } from "lucide-react";
import { kickDrawer } from "@/lib/cafe/print-client";
import { PrinterConnect, type ConnectRow } from "./PrinterConnect";
import { CopyButton } from "./CopyButton";

/**
 * التركيب — أربعة أفعال.
 *
 * شغّل السكربت · اربط الطابعات · افتح الشاشات · جرّب الدرج. لا شروح ولا قوائم
 * فحص؛ كل قسم شيء يُفعل ويُرى أثره فوراً.
 */

export type SetupPrinter = ConnectRow;

export type ScreenLink = { title: string; note: string; path: string; url: string; qr: string };

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
        <PrinterConnect printers={printers} />
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
