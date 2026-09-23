import { describe, expect, it } from "vitest";
import { cameraBlockedReason, isPairId, newPairId, pairChannel, pairUrl, parseMessage, shouldSend, REPEAT_MS } from "./pair";

/**
 * قناة عامّة يقرأ منها جهازٌ لا نملكه — فالفحص هنا على ما يُرفض لا ما يُقبل.
 */
describe("newPairId", () => {
  it("يولّد معرّفاً مقبولاً في كل مرّة، ولا يكرّره", () => {
    const ids = new Set(Array.from({ length: 50 }, newPairId));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(isPairId(id)).toBe(true);
  });
});

describe("isPairId", () => {
  it("يرفض ما ليس معرّفاً — والمسار يأتي من المستخدم", () => {
    for (const bad of ["", null, undefined, "../admin", "abc", "a".repeat(80), "pair:1", "٠١٢٣"]) {
      expect(isPairId(bad), String(bad)).toBe(false);
    }
  });
});

describe("pairChannel / pairUrl", () => {
  it("يبادئ القناة كي لا تصطدم بقنوات الطلبات", () => {
    expect(pairChannel("abc")).toBe("pair:abc");
    expect(pairChannel("abc")).not.toBe("station-expediter");
  });

  it("يبني الرابط ولا يضاعف الشرطة", () => {
    expect(pairUrl("https://stationiraq.com", "x1")).toBe("https://stationiraq.com/scan/x1");
    expect(pairUrl("https://stationiraq.com/", "x1")).toBe("https://stationiraq.com/scan/x1");
  });
});

describe("shouldSend", () => {
  it("يبثّ أول قراءة", () => {
    expect(shouldSend("908-73S", null, 1000)).toBe(true);
  });

  it("يكبح نفس التذكرة الباقية أمام الكاميرا", () => {
    const last = { code: "908-73S", at: 1000 };
    expect(shouldSend("908-73S", last, 1000 + REPEAT_MS - 1)).toBe(false);
    expect(shouldSend("908-73S", last, 1000 + REPEAT_MS)).toBe(true);
  });

  it("لا يكبح تذكرةً أخرى — الموظّف يمسح تذكرتين متتاليتين", () => {
    expect(shouldSend("909-11A", { code: "908-73S", at: 1000 }, 1001)).toBe(true);
  });

  it("يهمل الفارغ", () => {
    expect(shouldSend("   ", null, 1)).toBe(false);
  });
});

describe("parseMessage", () => {
  it("يقبل الرسائل الخمس", () => {
    expect(parseMessage({ kind: "hello" })).toEqual({ kind: "hello" });
    expect(parseMessage({ kind: "welcome", screen: "التجهيز" })).toEqual({ kind: "welcome", screen: "التجهيز" });
    expect(parseMessage({ kind: "scan", code: "908-73S", at: 5 })).toEqual({ kind: "scan", code: "908-73S", at: 5 });
    expect(parseMessage({ kind: "ack", ok: true, text: "جاهز" })).toEqual({ kind: "ack", ok: true, text: "جاهز" });
    expect(parseMessage({ kind: "bye", reason: "taken" })).toEqual({ kind: "bye", reason: "taken" });
  });

  it("يرفض ما لا شكل له — القناة عامّة وما يصل منها بيانات لا أوامر", () => {
    for (const bad of [null, undefined, 1, "hello", [], {}, { kind: "scan" }, { kind: "scan", code: "  " }, { kind: "nuke" }]) {
      expect(parseMessage(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("يقصّ الطويل بدل أن يمرّره", () => {
    const m = parseMessage({ kind: "scan", code: "x".repeat(500) });
    expect(m?.kind === "scan" && m.code.length).toBe(200);
  });

  it("سببٌ مجهول للوداع يصير «closed» لا يُصدَّق كما جاء", () => {
    expect(parseMessage({ kind: "bye", reason: "whatever" })).toEqual({ kind: "bye", reason: "closed" });
  });
});

describe("cameraBlockedReason", () => {
  it("يصمت حين تعمل الكاميرا", () => {
    expect(cameraBlockedReason("https:", "stationiraq.com")).toBeNull();
    expect(cameraBlockedReason("http:", "localhost")).toBeNull();
  });

  it("يسمّي السبب على عنوان الهَب المحلّي بدل «تعذّر تشغيل الكاميرا»", () => {
    expect(cameraBlockedReason("http:", "192.168.1.20")).toContain("https");
  });
});
