"use client";

import { useEffect } from "react";
import { isRtl, type SiteLang } from "@/lib/site/copy";

/**
 * لغة المستند على <html> نفسه.
 *
 * التخطيط الجذر واحد للنظام كلّه ويكتب `lang="ar" dir="rtl"` — والمحتوى هنا
 * يصحّح اتجاهه في غلافه، فالصفحة تبدو سليمة. لكن `<html lang="ar">` فوق صفحة
 * إنكليزية يجعل القارئ الصوتي ينطقها بالعربية، ويجعل جوجل يصنّفها صفحة عربية
 * مكرّرة عن الأصل بدل نسخة مستقلّة.
 *
 * ولماذا من المتصفّح لا من الخادم: قراءة ترويسة الطلب في التخطيط الجذر تُخرج
 * النظام كلّه من التوليد الساكن — صفحات التعريف الخمس تصير ديناميكية لتصحيح
 * كلمتين. هذا سطران، والزاحف يشغّل جافاسكربت.
 */
export function HtmlLang({ lang }: { lang: SiteLang }) {
  useEffect(() => {
    const el = document.documentElement;
    const was = { lang: el.lang, dir: el.dir };
    el.lang = lang;
    el.dir = isRtl(lang) ? "rtl" : "ltr";
    // CafeUIProvider يكتب لغة واجهة الموظّفين على <html> أيضاً — هذه الراية
    // تقول له إن الصفحة تملك لغتها، فيتركها
    el.dataset.langOwned = "1";
    // الرجوع عند الخروج: شاشات الموظّفين عربية، ولا تُترك بلغة زائر
    return () => {
      delete el.dataset.langOwned;
      el.lang = was.lang;
      el.dir = was.dir;
    };
  }, [lang]);
  return null;
}
