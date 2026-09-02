"use client";

import { PrinterConnect, type ConnectRow } from "./PrinterConnect";
import type { PrinterConfig } from "@/lib/cafe/printer-actions";

/**
 * /printers — نفس شاشة الربط التي في التركيب، لا شاشة ثانية.
 *
 * كانت هذه الصفحة تعرض لكل طابعة: عنوان IP، ومنفذاً، واسم مشاركة، وعدد نسخ.
 * وصاحب المحل قال: «هذه غير مفهومة لي، والآيبي كيف أدخله؟ وهل يستكشف النظام
 * تلقائياً؟».
 *
 * الجواب: نعم يستكشف، ولا يُدخَل عنوان إطلاقاً. طابعات هذا المحل موصولة بجهاز
 * الكاشير، فويندوز يعرفها والوكيل يسألها. والحقول التي كانت تبدو مملوءة بعناوين
 * لم تكن قيماً أصلاً — كانت أمثلة رمادية تُقرأ كأنها بيانات، وهذا أسوأ من
 * الفراغ.
 *
 * فبقي فعل واحد: اطبع الأرقام، وامشِ، واضغط الرقم الذي خرج عندك. أما المنفذ
 * وعدد النسخ فلم يغيّرهما أحد منذ التركيب، ومكانهما القاعدة لا شاشة يومية.
 */
export function PrintersClient({ printers, isAdmin }: { printers: PrinterConfig[]; isAdmin: boolean }) {
  const rows: ConnectRow[] = printers.map((p) => ({
    id: p.id,
    name_ar: p.name_ar,
    kind: p.kind,
    station_name: p.station_name ?? null,
    share: p.share,
    host: p.host,
    is_active: p.is_active,
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-2xl font-black">الطابعات</h1>
        <p className="text-sm font-bold text-muted-foreground">
          اطبع الأرقام، امشِ في المحل، واضغط الرقم الذي خرج عند كل مطبخ.
        </p>
      </header>

      <div className="rounded-2xl border-2 border-border bg-card p-4">
        <PrinterConnect printers={rows} canEdit={isAdmin} />
      </div>

      {!isAdmin && (
        <p className="text-center text-xs font-bold text-muted-foreground">الربط للمدير فقط.</p>
      )}
    </div>
  );
}
