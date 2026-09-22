"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * يظهر القسم حين يصل إليه القارئ — مرّة واحدة ثم يُنسى.
 *
 * IntersectionObserver لا مستمع تمرير: المتصفح يخبرنا حين تدخل البطاقة
 * الشاشة بدل أن نسأله في كل إطار. والصنف يُضاف ولا يُزال، فالقسم لا يومض
 * كلما مرّ الزائر عليه صعوداً ونزولاً. وحين يُطفئ أحدهم الحركة من نظامه
 * فالقاعدة في globals.css تُظهر كل شيء أصلاً.
 */
export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).style.animationDelay = `${delay}ms`;
          e.target.classList.add("st-in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [delay]);

  return (
    <div ref={ref} className={`st-reveal ${className}`}>
      {children}
    </div>
  );
}
