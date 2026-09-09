import { describe, expect, it } from "vitest";
import { flatten, renderMessage, renderReply, toWhatsAppText } from "./whatsapp-render";
import type { Button, Reply } from "../../../supabase/functions/telegram-bot/order-flow";

const btns = (n: number): Button[] => Array.from({ length: n }, (_, i) => ({ text: `صنف ${i + 1}`, data: `o|item|${i + 1}` }));

describe("text", () => {
  it("turns the engine's HTML into WhatsApp markup and unescapes entities", () => {
    expect(toWhatsAppText("<b>سلّتك</b>\nبرجر &amp; بيبسي")).toBe("*سلّتك*\nبرجر & بيبسي");
    expect(toWhatsAppText("<code>073</code>")).toBe("`073`");
  });
});

describe("buttons", () => {
  it("sends three or fewer as real reply buttons", () => {
    const m = renderMessage("اختر:", btns(3));
    expect(m.type).toBe("interactive");
    if (m.type !== "interactive" || m.interactive.type !== "button") throw new Error("expected buttons");
    expect(m.interactive.action.buttons).toHaveLength(3);
    expect(m.interactive.action.buttons[0].reply.id).toBe("o|item|1");
  });

  it("sends four or more as a list", () => {
    const m = renderMessage("اختر:", btns(4));
    if (m.type !== "interactive" || m.interactive.type !== "list") throw new Error("expected list");
    expect(m.interactive.action.sections[0].rows).toHaveLength(4);
  });

  it("never exceeds WhatsApp's ten rows, and pages instead", () => {
    const m = renderMessage("اختر:", btns(20));
    if (m.type !== "interactive" || m.interactive.type !== "list") throw new Error("expected list");
    const rows = m.interactive.action.sections[0].rows;
    expect(rows).toHaveLength(9); // 8 items + «المزيد»
    expect(rows.at(-1)!.id).toBe("w|page|1");

    const p1 = renderMessage("اختر:", btns(20), 1);
    if (p1.type !== "interactive" || p1.interactive.type !== "list") throw new Error("expected list");
    const r1 = p1.interactive.action.sections[0].rows;
    expect(r1).toHaveLength(10); // «السابق» + 8 + «المزيد»
    expect(r1[0].id).toBe("w|page|0");
    expect(r1.at(-1)!.id).toBe("w|page|2");
    // the middle page must still carry real items, not just navigation
    expect(r1[1].id).toBe("o|item|9");
  });

  it("keeps a long name readable: the title is cut, the full name goes to the description", () => {
    const m = renderMessage("اختر:", [...btns(4), { text: "كنتاكي 15 قطعة — 34,000 د.ع", data: "o|item|k" }]);
    if (m.type !== "interactive" || m.interactive.type !== "list") throw new Error("expected list");
    const row = m.interactive.action.sections[0].rows.at(-1)!;
    expect(row.title.length).toBeLessThanOrEqual(24);
    expect(row.description).toContain("كنتاكي 15 قطعة");
  });

  it("drops the deaf quantity button and writes the count in the text instead", () => {
    const reply: Reply = {
      text: "*ماشروم برجر*\n8,500 د.ع",
      buttons: [
        [{ text: "➖", data: "o|qty|-" }, { text: "3", data: "o|noop" }, { text: "➕", data: "o|qty|+" }],
        [{ text: "✅ أضف للسلّة", data: "o|add" }],
      ],
    };
    const { buttons, qty } = flatten(reply);
    expect(qty).toBe("3");
    expect(buttons.map((b) => b.data)).toEqual(["o|qty|-", "o|qty|+", "o|add"]);
    expect(renderReply(reply).text).toContain("العدد: 3");
  });

  it("falls back to plain text when the reply has no buttons at all", () => {
    const m = renderMessage("اكتب ملاحظتك:", []);
    expect(m.type).toBe("text");
  });
});
