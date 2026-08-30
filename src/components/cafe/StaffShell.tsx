"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bike,
  Armchair,
  Bell,
  Boxes,
  BellOff,
  BellRing,
  Calculator,
  ChefHat,
  ClipboardList,
  CreditCard,
  Percent,
  Wrench,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Moon,
  MonitorPlay,
  MoreHorizontal,
  PackageCheck,
  Printer,
  QrCode,
  Sparkles,
  Sun,
  HandCoins,
  UtensilsCrossed,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { HubBadge } from "./HubBadge";
import { formatIqdLabel } from "@/lib/cafe/money";
import type { ShiftLine } from "@/lib/cafe/session-actions";
import { useCafeUI } from "@/components/CafeUIProvider";
import { canAccess, type StaffRole } from "@/lib/cafe/roles";
import { listPendingOrders } from "@/lib/cafe/cashier-actions";
import { savePushSubscription, removePushSubscription } from "@/lib/cafe/push-actions";
import { StationMark } from "./Logo";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// Shared AudioContext: browsers keep audio suspended until a user gesture,
// so we create ONE context, resume it on the first tap/click anywhere, and
// reuse it for every chime (a fresh context per chime stays silently blocked).
let audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  audioCtx ??= new Ctx();
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

/** two-tone chime for a new incoming order (WebAudio — no asset needed) */
function chime() {
  try {
    const ctx = getAudioCtx();
    [880, 1175].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.35);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.4);
    });
  } catch {
    /* audio blocked before first interaction — fine */
  }
}

/**
 * `allow` lists the job types that see a link. null = every signed-in staff
 * member. The owner (admin) always sees everything, so no entry lists it.
 */
type NavItem = { href: string; label: string; short: string; allow: StaffRole[] | null; icon: LucideIcon };
const NAV: NavItem[] = [
  { href: "/dashboard", label: "لوحة التحكم", short: "التحكم", allow: [], icon: LayoutDashboard },
  { href: "/cashier", label: "الكاشير", short: "الكاشير", allow: ["cashier"], icon: Calculator },
  { href: "/expediter", label: "التجهيز", short: "التجهيز", allow: ["expediter", "cashier"], icon: PackageCheck },
  { href: "/kds", label: "المطبخ", short: "المطبخ", allow: ["chef", "expediter", "cashier"], icon: ChefHat },
  { href: "/queue", label: "شاشة الاستلام", short: "الاستلام", allow: ["expediter", "cashier"], icon: MonitorPlay },
  { href: "/clean", label: "تنظيف الطاولات", short: "التنظيف", allow: ["cleaner", "cashier"], icon: Sparkles },
  { href: "/orders", label: "الطلبات الواردة", short: "الطلبات", allow: ["cashier", "expediter"], icon: ClipboardList },
  { href: "/tables", label: "الطاولات", short: "الطاولات", allow: ["cashier", "cleaner"], icon: Armchair },
  { href: "/loyalty", label: "الولاء", short: "الولاء", allow: ["cashier"], icon: CreditCard },
  { href: "/offers", label: "العروض", short: "العروض", allow: ["cashier"], icon: Percent },
  { href: "/debts", label: "سجل الديون", short: "الديون", allow: ["cashier"], icon: HandCoins },
  { href: "/partners", label: "شركات التوصيل", short: "الشركات", allow: [], icon: Bike },
  { href: "/menu-admin", label: "المنيو", short: "المنيو", allow: [], icon: UtensilsCrossed },
  { href: "/expenses", label: "المصروفات", short: "المصروفات", allow: ["cashier"], icon: Wallet },
  { href: "/employees", label: "الموظفون", short: "الموظفون", allow: [], icon: Users },
  { href: "/inventory", label: "المخزون", short: "المخزون", allow: ["chef", "cashier", "expediter"], icon: Boxes },
  { href: "/printers", label: "الطابعات", short: "الطابعات", allow: [], icon: Printer },
  { href: "/setup", label: "التركيب", short: "التركيب", allow: [], icon: Wrench },
  { href: "/qr", label: "رموز QR", short: "QR", allow: [], icon: QrCode },
  { href: "/help", label: "التعليمات", short: "تعليمات", allow: null, icon: HelpCircle },
];

export function StaffShell({
  role,
  name,
  pushKey = null,
  isDeveloper = false,
  shift = null,
  children,
}: {
  role: StaffRole | null;
  name: string;
  pushKey?: string | null;
  /** /setup belongs to the developer, not to every admin (0046) */
  isDeveloper?: boolean;
  /** the drawer, resolved server-side — null for roles that do not hold one */
  shift?: ShiftLine | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { setTheme } = useCafeUI();
  const links = NAV.filter(
    (n) => (n.href !== "/setup" || isDeveloper) && (canAccess(role, n.allow ?? []) || n.allow === null),
  );
  const bottomTabs = links.filter((l) => l.href !== "/help").slice(0, 4); // first 4 as bottom tabs, rest in «المزيد»
  const [moreOpen, setMoreOpen] = useState(false);

  // Keep the session alive on staff screens: instantiating the browser client
  // starts supabase-js's auto-refresh loop, which renews the access token and
  // writes it back to the cookie the server reads. Without this, server reads
  // silently degrade to anon an hour after login.
  useEffect(() => {
    try {
      createSupabaseBrowserClient();
    } catch {
      /* demo mode: no supabase env */
    }
  }, []);

  // unlock audio on the first interaction so later chimes actually sound
  useEffect(() => {
    const unlock = () => {
      try {
        getAudioCtx();
      } catch {
        /* no audio device */
      }
      window.removeEventListener("pointerdown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  // new-order alert on EVERY staff screen: poll pending self-orders, badge the
  // cashier nav item, and chime + toast when a fresh table order lands.
  const [pendingCount, setPendingCount] = useState(0);
  const [toast, setToast] = useState<{ seq: number; table: string | null } | null>(null);
  const knownIds = useRef<Set<string> | null>(null);
  // Only where somebody can act on it. A chef on /kds cannot take a pending
  // self-order, and polling it there cost five round trips every ten seconds
  // on a database ~320ms away — on every screen in the shop at once.
  const wantsPending = pathname.startsWith("/cashier") || pathname.startsWith("/orders") || pathname.startsWith("/dashboard");

  useEffect(() => {
    if (!wantsPending) return;
    let stopped = false;
    async function tick() {
      try {
        const orders = await listPendingOrders();
        if (stopped) return;
        setPendingCount(orders.length);
        if (knownIds.current) {
          const fresh = orders.find((o) => !knownIds.current!.has(o.id));
          if (fresh) {
            setToast({ seq: fresh.order_seq, table: fresh.table_no });
            chime();
            setTimeout(() => setToast(null), 9000);
          }
        }
        knownIds.current = new Set(orders.map((o) => o.id));
      } catch {
        /* demo mode or transient error */
      }
    }
    tick();
    const t = setInterval(tick, 15000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [wantsPending]);

  // Web Push: notifications that reach the device even with the app closed.
  const [pushState, setPushState] = useState<"unsupported" | "off" | "on" | "denied">("unsupported");
  useEffect(() => {
    if (!pushKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        setPushState(sub ? "on" : Notification.permission === "denied" ? "denied" : "off");
      })
      .catch(() => {});
  }, [pushKey]);
  async function togglePush() {
    if (!pushKey) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await existing.unsubscribe();
        await removePushSubscription(existing.endpoint);
        setPushState("off");
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setPushState(perm === "denied" ? "denied" : "off");
        return;
      }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(pushKey) });
      const j = sub.toJSON();
      if (!j.keys?.p256dh || !j.keys?.auth) return;
      await savePushSubscription({ endpoint: sub.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } });
      setPushState("on");
    } catch {
      /* unsupported browser / user dismissed */
    }
  }

  async function signOut() {
    try {
      await createSupabaseBrowserClient().auth.signOut();
    } finally {
      router.replace("/sign-in");
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-4">
            <Link href="/dashboard" className="flex shrink-0 items-center gap-2 whitespace-nowrap text-lg font-extrabold text-primary">
              <StationMark className="size-9" />
              ستيشن
            </Link>
            <nav className="hidden gap-1 overflow-x-auto md:flex">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`relative whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    pathname.startsWith(l.href)
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground/80 hover:bg-secondary"
                  }`}
                >
                  {l.label}
                  {l.href === "/orders" && pendingCount > 0 && (
                    <span className="absolute -left-1 -top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                      {pendingCount}
                    </span>
                  )}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* the drawer, on every screen — «هل الوردية مفتوحة؟» was answerable
                only by walking to the till and opening one specific page */}
            {shift &&
              (shift.open ? (
                <Link
                  href="/cashier"
                  title={shift.cashier ? `وردية ${shift.cashier}` : "وردية مفتوحة"}
                  className="hidden items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-black text-emerald-700 sm:flex dark:text-emerald-300"
                >
                  💵 {formatIqdLabel(shift.float)}
                  <span className="font-bold opacity-70">· {shift.sinceMinutes} د</span>
                </Link>
              ) : (
                <Link
                  href="/cashier"
                  className="flex items-center gap-1.5 rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-black text-amber-800 dark:text-amber-200"
                >
                  ⚠️ لم تبدأ الوردية
                </Link>
              ))}
            <HubBadge />
            <span className="hidden text-sm text-muted-foreground sm:inline">{name}</span>
            <button
              onClick={() => setTheme(document.documentElement.classList.contains("dark") ? "Light" : "Dark")}
              aria-label="المظهر الليلي/النهاري"
              title="تبديل المظهر الليلي/النهاري"
              className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-secondary"
            >
              <Sun className="hidden size-4 dark:block" />
              <Moon className="size-4 dark:hidden" />
            </button>
            <button
              onClick={chime}
              aria-label="تجربة صوت التنبيه"
              title="تجربة صوت التنبيه — إن لم تسمع شيئاً افحص صوت الجهاز"
              className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-secondary"
            >
              🔊
            </button>
            {pushState !== "unsupported" && (
              <button
                onClick={togglePush}
                aria-label="إشعارات الطلبات"
                title={
                  pushState === "on"
                    ? "الإشعارات مفعّلة — تصل حتى والتطبيق مغلق"
                    : pushState === "denied"
                      ? "الإشعارات محظورة — فعّلها من إعدادات الموقع في المتصفح"
                      : "تفعيل إشعارات الطلبات (تصل حتى والتطبيق مغلق)"
                }
                className={`rounded-lg border p-2 transition ${
                  pushState === "on" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                {pushState === "on" ? <Bell className="size-4" /> : <BellOff className="size-4" />}
              </button>
            )}
            <button onClick={signOut} aria-label="تسجيل الخروج" className="rounded-lg border border-border p-2 hover:bg-secondary">
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 pb-24 md:pb-5">{children}</main>

      {/* app-like bottom tab bar (mobile only) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-background/95 backdrop-blur md:hidden print:hidden">
        {bottomTabs.map((l) => {
          const active = pathname.startsWith(l.href);
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="size-5" />
              {l.short}
              {l.href === "/orders" && pendingCount > 0 && (
                <span className="absolute right-1/2 top-1 translate-x-4 rounded-full bg-destructive px-1.5 text-[9px] font-bold text-destructive-foreground">
                  {pendingCount}
                </span>
              )}
            </Link>
          );
        })}
        <button
          onClick={() => setMoreOpen(true)}
          className="relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold text-muted-foreground"
        >
          <MoreHorizontal className="size-5" />
          المزيد
        </button>
      </nav>

      {/* «المزيد» sheet — the full menu */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 md:hidden print:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-card p-4 pb-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <span className="font-bold">{name}</span>
              <button onClick={() => setMoreOpen(false)} aria-label="إغلاق" className="rounded-lg border border-border p-1.5 hover:bg-secondary">
                <X className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {links.map((l) => {
                const Icon = l.icon;
                const active = pathname.startsWith(l.href);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setMoreOpen(false)}
                    className={`relative flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-xs font-semibold transition ${
                      active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary"
                    }`}
                  >
                    <Icon className="size-6" />
                    {l.label}
                  </Link>
                );
              })}
              <button
                onClick={signOut}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-border p-3 text-xs font-semibold text-destructive hover:bg-secondary"
              >
                <LogOut className="size-6" />
                تسجيل الخروج
              </button>
            </div>
          </div>
        </div>
      )}

      {/* new-order toast */}
      {toast && (
        <Link
          href="/orders"
          onClick={() => setToast(null)}
          className="fixed inset-x-4 top-16 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-primary/30 bg-primary px-4 py-3 text-primary-foreground shadow-xl print:hidden"
        >
          <BellRing className="size-6 shrink-0 animate-bounce" />
          <span className="font-bold">
            طلب جديد #{String(toast.seq).padStart(3, "0")}
            {toast.table ? ` — طاولة ${toast.table}` : ""}
          </span>
          <span className="mr-auto text-xs opacity-80">اضغط للفتح</span>
        </Link>
      )}
    </div>
  );
}
