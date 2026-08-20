"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAdmin, requireStaff } from "./auth";
import { routeOrder, unroutedItems, type PrintItem, type PrinterRow, type StationRow } from "./print-routing";
import { renderTicket, testSlip, type Codepage } from "./escpos";
import { BRAND } from "@/lib/brand";

/**
 * Printer configuration and the server half of printing.
 *
 * The browser cannot open a TCP socket, and the Next server is on Netlify with
 * no route to the shop LAN. So the split is:
 *   here      → decide WHAT prints and render the ESC/POS bytes
 *   browser   → relay those bytes to http://127.0.0.1:9977 (print-client.ts)
 *   agent     → open the socket and write them (scripts/print-agent.ps1)
 *
 * All the logic stays server-side and testable; the browser is a dumb pipe.
 */

export type PrinterConfig = {
  id: string;
  name_ar: string;
  kind: "receipt" | "station" | "expediter";
  station_id: string | null;
  station_name: string | null;
  host: string | null;
  port: number;
  share: string | null;
  codepage: Codepage;
  copies: number;
  is_active: boolean;
  sort: number;
};

/** One printer's worth of bytes, ready for the agent. */
export type PrintJob = {
  printerId: string;
  printerName: string;
  /** null when the printer has no host AND no share — unconfigured */
  host: string | null;
  port: number;
  share: string | null;
  copies: number;
  /** base64 ESC/POS; base64 because this crosses a JSON boundary */
  data: string;
};

export async function listPrinters(): Promise<PrinterConfig[]> {
  await requireStaff();
  const svc = createSupabaseServiceClient();
  const { data } = await svc
    .from("printers")
    .select("id, name_ar, kind, station_id, host, port, share, codepage, copies, is_active, sort")
    .order("sort", { ascending: true });
  const { data: stations } = await svc.from("stations").select("id, name_ar");
  const names = new Map((stations ?? []).map((s) => [s.id, s.name_ar]));
  return (data ?? []).map((p) => ({
    ...p,
    codepage: p.codepage as Codepage,
    kind: p.kind as PrinterConfig["kind"],
    station_name: p.station_id ? names.get(p.station_id) ?? null : null,
  }));
}

export async function savePrinter(input: {
  id: string;
  host: string | null;
  port: number;
  share: string | null;
  codepage: Codepage;
  copies: number;
  is_active: boolean;
}) {
  await requireAdmin();
  const svc = createSupabaseServiceClient();
  const { error } = await svc
    .from("printers")
    .update({
      host: input.host?.trim() || null,
      port: Math.min(65535, Math.max(1, Math.round(input.port) || 9100)),
      share: input.share?.trim() || null,
      codepage: input.codepage,
      copies: Math.min(3, Math.max(1, Math.round(input.copies) || 1)),
      is_active: input.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/printers");
  return { ok: true as const };
}

/** A calibration slip so the owner can see which codepage their hardware likes. */
export async function buildTestJob(printerId: string, codepage: Codepage): Promise<PrintJob | null> {
  await requireStaff();
  const printers = await listPrinters();
  const p = printers.find((x) => x.id === printerId);
  if (!p) return null;
  return {
    printerId: p.id,
    printerName: p.name_ar,
    host: p.host,
    port: p.port,
    share: p.share,
    copies: 1,
    data: toBase64(testSlip(p.name_ar, codepage)),
  };
}

/**
 * The main event: split one paid order across the printers.
 *
 * Reads through the SERVICE client because it joins menu_items → categories to
 * resolve station routing, and menu_items is revoked from `authenticated` at
 * the column level. requireStaff above is the gate.
 */
export async function buildOrderJobs(
  orderId: string,
  { kickDrawer = false }: { kickDrawer?: boolean } = {},
): Promise<{ jobs: PrintJob[]; unrouted: string[] }> {
  await requireStaff();
  const svc = createSupabaseServiceClient();

  const { data: order } = await svc
    .from("orders")
    // one literal string, not a concatenation: supabase-js infers the row type
    // from the select text, and `a + b` erases that inference
    .select("id, order_seq, pickup_code, channel, table_no, note, subtotal, discount, extra, extra_note, customer_phone, address_note, customer_name, cashier_id, expediter_id, created_at")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { jobs: [], unrouted: [] };

  const { data: rawItems } = await svc
    .from("order_items")
    .select("name_ar, flavor_ar, qty, unit_price, item_id")
    .eq("order_id", orderId);

  const itemIds = [...new Set((rawItems ?? []).map((i) => i.item_id).filter(Boolean))] as string[];
  const { data: menu } = itemIds.length
    ? await svc.from("menu_items").select("id, category_id").in("id", itemIds)
    : { data: [] };
  const catOfItem = new Map((menu ?? []).map((m) => [m.id, m.category_id]));

  const { data: cats } = await svc.from("categories").select("id, station_id");
  const categoryStation: Record<string, string | null> = {};
  for (const c of cats ?? []) categoryStation[c.id] = c.station_id;

  const { data: stationRows } = await svc.from("stations").select("id, name_ar");
  const stations: StationRow[] = (stationRows ?? []).map((s) => ({ id: s.id, name_ar: s.name_ar }));

  // Both names go on the assembly ticket — that is the accountability record.
  const staffIds = [order.cashier_id, order.expediter_id].filter(Boolean) as string[];
  const { data: staffRows } = staffIds.length
    ? await svc.from("employees").select("id, name_ar").in("id", staffIds)
    : { data: [] };
  const staffName = new Map((staffRows ?? []).map((e) => [e.id, e.name_ar]));
  const cashierName = order.cashier_id ? staffName.get(order.cashier_id) ?? null : null;
  const expediterName = order.expediter_id ? staffName.get(order.expediter_id) ?? null : null;

  const items: PrintItem[] = (rawItems ?? []).map((i) => ({
    name_ar: i.name_ar,
    flavor_ar: i.flavor_ar,
    qty: i.qty,
    unit_price: i.unit_price,
    category_id: i.item_id ? catOfItem.get(i.item_id) ?? null : null,
  }));

  const configs = await listPrinters();
  const printers: PrinterRow[] = configs.map((p) => ({
    id: p.id,
    name_ar: p.name_ar,
    kind: p.kind,
    station_id: p.station_id,
    is_active: p.is_active,
    copies: p.copies,
  }));

  const extras = order.extra > 0 ? [{ name: order.extra_note ?? "إضافات", price: order.extra }] : [];
  const tickets = routeOrder({
    order: {
      orderId: order.id,
      orderNumber: String(order.order_seq).padStart(3, "0"),
      pickupCode: order.pickup_code,
      channel: order.channel,
      tableNo: order.table_no,
      note: order.note,
      subtotal: order.subtotal,
      discount: order.discount,
      extras,
      total: Math.max(0, order.subtotal - order.discount + order.extra),
      dateTime: new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Baghdad",
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      }).format(new Date(order.created_at)),
      cashierName,
      expediterName,
      customerPhone: order.customer_phone,
      addressNote: order.address_note,
      customerName: order.customer_name,
    },
    items,
    printers,
    stations,
    categoryStation,
  });

  const byId = new Map(configs.map((p) => [p.id, p]));
  const jobs: PrintJob[] = tickets.map((t) => {
    const p = byId.get(t.printerId)!;
    return {
      printerId: p.id,
      printerName: p.name_ar,
      host: p.host,
      port: p.port,
      share: p.share,
      copies: p.copies,
      data: toBase64(
        renderTicket(t, {
          codepage: p.codepage,
          // the drawer hangs off the receipt printer, and only for cash
          kickDrawer: kickDrawer && t.kind === "receipt",
          shopNameAr: BRAND.nameAr,
          shopCityAr: BRAND.cityAr,
        }),
      ),
    };
  });

  // surfaced in the UI so a category nobody routed (the original Fries gap)
  // is noticed at the counter instead of in the kitchen
  const unrouted = [...new Set(unroutedItems(items, categoryStation).map((i) => i.name_ar))];
  return { jobs, unrouted };
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
