"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label = "طباعة" }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition hover:opacity-90 print:hidden"
    >
      <Printer className="size-4" />
      {label}
    </button>
  );
}
