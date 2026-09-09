"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteAlias, listAliases, saveAlias, unknownAliases, type Alias, type AliasSource } from "@/lib/cafe/alias-actions";
import type { AdminCategory } from "@/lib/cafe/menu-admin-actions";

/**
 * «أسماء الأصناف عند الشركة» — الجدول الذي يُترجم شاشة توترز إلى منيونا.
 *
 * صفّ لكل اسم عندهم: صنفنا، وحجمه إن كان له أحجام، ونكهته. وفوق الجدول ما وصل
 * من الشاشة ولم يُعرف بعد — يُربط بضغطة، فلا يعود تنبيهاً.
 */
export function PartnerAliases({ source, menu }: { source: AliasSource; menu: AdminCategory[] }) {
  const [rows, setRows] = useState<Alias[]>([]);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [alias, setAlias] = useState("");
  const [itemId, setItemId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [flavor, setFlavor] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const items = menu.flatMap((c) => c.items.map((i) => ({ ...i, category: c.name_ar })));
  const item = items.find((i) => i.id === itemId) ?? null;
  const itemName = (id: string) => items.find((i) => i.id === id)?.name_ar ?? "—";
  const variantName = (id: string | null) => (id ? items.flatMap((i) => i.variants).find((v) => v.id === id)?.name_ar ?? null : null);

  async function load() {
    const [a, u] = await Promise.all([listAliases(source), unknownAliases(source)]);
    setRows(a);
    setUnknown(u);
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- polling an external system; state is set after an await
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  async function save() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await saveAlias({ source, alias, item_id: itemId, variant_id: variantId || null, flavor: flavor || null });
      if (!res.ok) return setMsg(res.error);
      setAlias("");
      setVariantId("");
      setFlavor("");
      await load();
    } catch {
      setMsg("تعذّر الحفظ.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 space-y-2 rounded-xl border border-border bg-background p-3">
      <p className="text-sm font-bold">🔗 أسماء الأصناف عند الشركة</p>
      <p className="text-xs text-muted-foreground">اسمهم كما يظهر على جهازهم — مع الخيار بعد «/» إن كان يغيّر الصنف (وجبة كنتاكي / 3 قطع) — يُترجم إلى صنفنا وسعرنا.</p>

      {unknown.length > 0 && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-2 text-sm">
          <p className="mb-1 font-bold">لم تُعرف بعد — اضغط الاسم ليُملأ في الصفّ:</p>
          <div className="flex flex-wrap gap-1.5">
            {unknown.map((u) => (
              <button key={u} onClick={() => setAlias(u)} className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-bold hover:bg-secondary">
                {u}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-1.5 md:grid-cols-[2fr_2fr_1fr_1fr_auto]">
        <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="اسمهم" className="rounded-lg border border-input bg-card px-3 py-1.5 text-sm" />
        <select
          value={itemId}
          onChange={(e) => {
            setItemId(e.target.value);
            setVariantId("");
            setFlavor("");
          }}
          className="rounded-lg border border-input bg-card px-3 py-1.5 text-sm"
        >
          <option value="">— صنفنا —</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.category} · {i.name_ar} · {i.price.toLocaleString("en-US")}
            </option>
          ))}
        </select>
        <select value={variantId} onChange={(e) => setVariantId(e.target.value)} disabled={!item?.variants.length} className="rounded-lg border border-input bg-card px-3 py-1.5 text-sm disabled:opacity-50">
          <option value="">{item?.variants.length ? "— الحجم —" : "لا أحجام"}</option>
          {item?.variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name_ar} · {(v.price_override ?? item.price).toLocaleString("en-US")}
            </option>
          ))}
        </select>
        <select value={flavor} onChange={(e) => setFlavor(e.target.value)} disabled={!item?.flavors.length} className="rounded-lg border border-input bg-card px-3 py-1.5 text-sm disabled:opacity-50">
          <option value="">{item?.flavors.length ? "— النكهة —" : "لا نكهات"}</option>
          {item?.flavors.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <button onClick={() => void save()} disabled={busy || !alias.trim() || !itemId} className="rounded-lg bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
          {busy ? "…" : "ربط"}
        </button>
      </div>
      {msg && <p className="text-sm text-destructive">{msg}</p>}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-muted-foreground">
                <th className="px-2 py-1 font-medium">عندهم</th>
                <th className="px-2 py-1 font-medium">عندنا</th>
                <th className="px-2 py-1 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-2 py-1 font-bold">{r.alias}</td>
                  <td className="px-2 py-1">
                    {itemName(r.item_id)}
                    {variantName(r.variant_id) ? ` · ${variantName(r.variant_id)}` : ""}
                    {r.flavor ? ` (${r.flavor})` : ""}
                  </td>
                  <td className="px-2 py-1 text-left">
                    <button
                      onClick={async () => {
                        await deleteAlias(r.id);
                        await load();
                      }}
                      aria-label="حذف"
                      className="rounded-lg p-1 text-destructive hover:bg-secondary"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
