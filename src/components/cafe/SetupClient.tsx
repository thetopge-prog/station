"use client";

import Image from "next/image";
import { Inbox, Monitor, Printer, Server, Smartphone, Terminal } from "lucide-react";
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
  hubCommand = null,
  webhookSecret = null,
  whatsapp,
}: {
  printers: SetupPrinter[];
  screens: ScreenLink[];
  installCommand: string;
  /** مُعِدّ الهَب — ستيشن داخل المحل بلا إنترنت */
  hubCommand?: string | null;
  /** كلمة سرّ الأجهزة (هاتف المطعم، جهاز توترز) — تُعرض للمطوّر هنا لا في ملف */
  webhookSecret?: string | null;
  /** بوت واتساب: ما يُلصق في لوحة Meta */
  whatsapp?: { url: string; verifyToken: string | null; ready: boolean; subscription: { ok: boolean; detail: string } };
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

      {/* تطبيق واحد لهاتف المطعم ولجهاز شركة التوصيل: يقرأ إشعار «طلب جديد» من
          تطبيق توترز/طلباتي ويرسله كما يرسل رقم المتصل. لا واجهة برمجية عندهم. */}
      <Section icon={<Smartphone className="size-5" />} title="٥ — جهاز توترز / طلباتي">
        <a
          href="/apk"
          className="touch-pos block w-full rounded-xl bg-primary px-4 py-3 text-center font-black text-primary-foreground hover:opacity-90"
        >
          نزّل تطبيق ستيشن (APK) على الجهاز
        </a>
        {/* كلمة السرّ التي يطلبها التطبيق — «فحص» يردّ 422 حين تكون صحيحة */}
        <div className="mt-3 rounded-xl border border-border bg-background p-3">
          <p className="mb-1 text-xs font-bold text-muted-foreground">كلمة السرّ للتطبيق (هاتف المطعم وجهاز توترز/طلباتي)</p>
          {webhookSecret ? (
            <div className="flex items-center gap-2">
              <code dir="ltr" className="min-w-0 flex-1 select-all break-all rounded-lg bg-secondary px-3 py-2 text-sm font-bold">
                {webhookSecret}
              </code>
              <CopyButton value={webhookSecret} />
            </div>
          ) : (
            <p className="text-sm font-bold text-destructive">⚠ لا يوجد STATION_WEBHOOK_SECRET في متغيّرات الخادم — التطبيق لن يُقبل.</p>
          )}
        </div>
        <ol className="mt-3 list-inside list-decimal space-y-1 text-sm font-bold text-muted-foreground">
          <li>افتح <code dir="ltr">station-anbar.netlify.app/apk</code> من متصفح الجهاز ونصّبه (اسمح بـ«مصادر غير معروفة»).</li>
          <li>افتح التطبيق: العنوان كما هو، وكلمة السرّ أعلاه، ثم «حفظ» ثم «فحص» — الجواب <b>422</b> يعني أنها صحيحة.</li>
          <li>«تفعيل قراءة شاشة توترز وطلباتي» ← فعّل «ستيشن» — يقرأ شاشة الطلب حين تُفتح فيصل الكاشير طلباً كاملاً.</li>
          <li>«تفعيل مكالمات واتساب» ← وصول الإشعارات ← «ستيشن» — احتياط: رقم الطلب يصل تنبيهاً ولو لم تُقرأ الشاشة.</li>
          <li>أول طلب حقيقي: افتحه في توترز كالعادة ← يظهر على «الطلبات الواردة» بزرّ «قبول — توترز». اسم لم يُعرف؟ يُربط مرّة من «شركات التوصيل».</li>
        </ol>
      </Section>

      {/* الهَب: النسخة نفسها على جهاز في المحل — تعمل بلا إنترنت وترفع ما حُفظ حين يعود (docs/HUB.md) */}
      {hubCommand && (
        <Section icon={<Server className="size-5" />} title="٧ — الهَب: العمل بلا إنترنت">
          <p className="mb-3 text-sm font-bold text-muted-foreground">
            الموقع اليوم على نتلفاي: ينقطع الإنترنت فيتوقف الكاشير. الهَب هو ستيشن نفسه يعمل على جهاز داخل المحل (جهاز الكاشير يصلح)،
            فتبقى الطلبات والطباعة وشاشات المطبخ والتجهيز والاستلام تعمل، وتُرفع الطلبات إلى السحابة تلقائياً حين يعود الخط.
          </p>
          <div className="flex items-start gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-secondary p-3 text-left text-xs" dir="ltr">
              {hubCommand}
            </code>
            <CopyButton value={hubCommand} />
          </div>
          <ol className="mt-3 list-inside list-decimal space-y-1.5 text-sm font-bold text-muted-foreground">
            <li>على جهاز المحل: PowerShell كمسؤول ← الصق السطر أعلاه.</li>
            <li>
              أول مرة يفتح المفكّرة على <code dir="ltr">C:\station\.env.local</code> بأسماء المتغيّرات فقط — الصق قيمها من Netlify ← Site
              configuration ← Environment variables (نفس قيم الموقع)، احفظ، ثم شغّل السطر مرة ثانية.
            </li>
            <li>يثبّت Node، ينزّل آخر نسخة، يبنيها، ويسجّلها خدمة «StationHub» تبدأ مع ويندوز على المنفذ 3000، ويطبع عنوان الجهاز.</li>
            <li>
              في الراوتر ثبّت IP للجهاز، ثم وجّه كل الشاشات (الكاشير، المطبخ، التجهيز، الاستلام، منيو QR) إلى{" "}
              <code dir="ltr">http://&lt;IP&gt;:3000/…</code> بدل رابط نتلفاي. وكيل الطباعة (القسم ١) يبقى كما هو على الجهاز نفسه.
            </li>
            <li>عند انقطاع الخط يظهر في شريط الموظفين «يعمل بلا إنترنت»، وحين يعود «يرفع N» حتى يفرغ.</li>
            <li>
              <b>التحديث</b>: كل إصدار جديد على نتلفاي لا يصل الهَب وحده — شغّل السطر نفسه مرة أخرى على جهاز المحل (دقيقتان، والقاعدة
              المحلية في <code dir="ltr">C:\station\data</code> تبقى).
            </li>
          </ol>
          <p className="mt-3 text-xs font-bold text-muted-foreground">
            ما يعمل بلا إنترنت الآن: طلبات الزبائن (QR/كشك/التوصيل)، شاشات المطبخ والتجهيز والاستلام، الطباعة، الدخول لمن دخل من قبل (١٦ ساعة). بيع
            الكاشير نفسه ما زال يحتاج الخط — هذه المرحلة التالية.
          </p>
        </Section>
      )}

      {/* بوت واتساب: نفس محرّك بوت تليغرام، ويُربط من لوحة Meta بهذين السطرين */}
      {whatsapp && (
        <Section icon={<Smartphone className="size-5" />} title="٦ — بوت واتساب">
          <p className={`mb-2 text-sm font-bold ${whatsapp.ready ? "text-primary" : "text-destructive"}`}>
            {whatsapp.ready ? "✅ المتغيّرات الأربعة مضبوطة — البوت جاهز للربط." : "⚠ ناقص في متغيّرات Netlify: WHATSAPP_TOKEN · WHATSAPP_PHONE_NUMBER_ID · WHATSAPP_APP_SECRET · WHATSAPP_VERIFY_TOKEN"}
          </p>
          {/* اشتراك الحساب في التطبيق — يُفحص ويُصلَح عند كل فتح لهذه الصفحة */}
          <p className={`mb-2 text-sm font-bold ${whatsapp.subscription.ok ? "text-primary" : "text-destructive"}`}>
            {whatsapp.subscription.ok ? "✅" : "⚠"} اشتراك الحساب في التطبيق: {whatsapp.subscription.detail}
          </p>
          <div className="space-y-2 rounded-xl border border-border bg-background p-3">
            <div>
              <p className="mb-1 text-xs font-bold text-muted-foreground">Callback URL — يُلصق في Meta ← WhatsApp ← Configuration</p>
              <div className="flex items-center gap-2">
                <code dir="ltr" className="min-w-0 flex-1 select-all break-all rounded-lg bg-secondary px-3 py-2 text-sm font-bold">{whatsapp.url}</code>
                <CopyButton value={whatsapp.url} />
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-bold text-muted-foreground">Verify token — نفس القيمة في Netlify وفي Meta</p>
              {whatsapp.verifyToken ? (
                <div className="flex items-center gap-2">
                  <code dir="ltr" className="min-w-0 flex-1 select-all break-all rounded-lg bg-secondary px-3 py-2 text-sm font-bold">{whatsapp.verifyToken}</code>
                  <CopyButton value={whatsapp.verifyToken} />
                </div>
              ) : (
                <p className="text-sm font-bold text-destructive">⚠ لا يوجد WHATSAPP_VERIFY_TOKEN في متغيّرات الخادم.</p>
              )}
            </div>
          </div>
          <ol className="mt-3 list-inside list-decimal space-y-1 text-sm font-bold text-muted-foreground">
            <li>في Meta: التطبيق ← WhatsApp ← Configuration ← Edit، الصق العنوان والكلمة أعلاه ثم Verify and save.</li>
            <li>اشترك في الحقل <code dir="ltr">messages</code> من جدول Webhook fields.</li>
            <li>WhatsApp ← API Setup: أضف رقم هاتفك في «To» ليصلك من الرقم الاختباري، ثم أرسل «مرحبا» للبوت.</li>
            <li>الطلب يصل «الطلبات الواردة» على الكاشير بزرّ قبول، ويُبلَّغ الزبون على واتساب حين يُقبل ويجهز.</li>
          </ol>
        </Section>
      )}
    </div>
  );
}
