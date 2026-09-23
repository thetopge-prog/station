"use client";

import { useEffect, useRef } from "react";

/**
 * مفتاحٌ واحد ومعالجه — للشاشات التي تملك بياناتها.
 *
 * «تجهيز كل الطلبات» يحتاج صفوف الشاشة، و«دفع نقدي» يحتاج السلّة — فلا يمكن
 * أن يُنادى أيٌّ منهما من القشرة. القشرة تحمل ما يُنفَّذ من أي مكان (المصروف،
 * التنقّل)، وهذا الخطّاف يحمل الباقي في شاشته.
 *
 * والمعالج في مرجع: الشاشات تُعيد الرسم مع كل تحديث للطلبات، ولو بقي في
 * التبعيات لفُكّ المستمع ورُكّب في كل رسمة.
 */
export function useShortcut(key: string, enabled: boolean, run: () => void) {
  const fn = useRef(run);
  useEffect(() => {
    fn.current = run;
  }, [run]);

  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== key) return;
      const el = e.target as HTMLElement | null;
      // لا يُخطف مفتاحٌ من يدٍ تكتب — نفس حارس القارئ الضوئي
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      e.preventDefault();
      fn.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, enabled]);
}
