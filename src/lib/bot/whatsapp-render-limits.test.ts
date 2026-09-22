import { describe, expect, it } from "vitest";
import { renderMenuLink, renderMessage, renderRateScale, renderSavedOrders, renderWelcome, type WaMessage } from "./whatsapp-render";

/**
 * حدود واتساب على العناوين ليست تجميلاً: تجاوزها يُسقط الرسالة كلّها
 * (خطأ 131009) فيبدو البوت صامتاً — وهو ما وقع في 22/09.
 */
const titles = (m: WaMessage): { buttons: string[]; rows: string[] } => {
  if (m.type === "text") return { buttons: [], rows: [] };
  const i = m.interactive;
  if (i.type === "button") return { buttons: i.action.buttons.map((b) => b.reply.title), rows: [] };
  if (i.type === "list") return { buttons: [i.action.button], rows: i.action.sections.flatMap((s) => s.rows.map((r) => r.title)) };
  return { buttons: [i.action.parameters.display_text], rows: [] };
};

const LONG = "اطلب هسة من المنيو الكامل بالصور والأسعار وكل التفاصيل";

describe("whatsapp message limits", () => {
  const messages: [string, WaMessage][] = [
    ["welcome", renderWelcome(true)],
    ["welcome (no saved)", renderWelcome(false)],
    ["menu link", renderMenuLink("https://stationiraq.com/menu")],
    ["rating scale", renderRateScale("قيّم تجربتك")],
    ["saved orders", renderSavedOrders([{ id: "a", order_seq: 42, label: "زنجر بوفالو ×2 + ببسي — 12,000 د.ع" }])],
    ["buttons", renderMessage("اختر", [{ text: LONG, data: "o|cats" }, { text: "ثانٍ", data: "o|cart" }])],
    ["list", renderMessage("اختر", Array.from({ length: 12 }, (_, i) => ({ text: `${LONG} ${i}`, data: `o|cat|${i}` })))],
  ];

  for (const [name, msg] of messages) {
    it(`${name}: buttons ≤ 20 and rows ≤ 24 characters`, () => {
      const { buttons, rows } = titles(msg);
      expect(buttons.filter((t) => t.length > 20)).toEqual([]);
      expect(rows.filter((t) => t.length > 24)).toEqual([]);
    });
  }

  it("a list never exceeds ten rows", () => {
    const { rows } = titles(renderMessage("اختر", Array.from({ length: 30 }, (_, i) => ({ text: `صنف ${i}`, data: `o|item|${i}` }))));
    expect(rows.length).toBeLessThanOrEqual(10);
  });
});
