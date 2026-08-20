import { BRAND } from "@/lib/brand";

/**
 * The Station smiley — the mark stamped on the boxes, cups and fry sleeves.
 *
 * Drawn as inline SVG rather than shipped as a PNG: it has to sit on orange,
 * on white and on kraft, at 24px in a nav bar and at 200px on a TV, and it must
 * render before any network request completes (the POS screens run offline).
 * `currentColor` lets it inherit whatever it is placed on.
 */
export function StationSmiley({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label={BRAND.nameAr} fill="none">
      <circle cx="32" cy="32" r="29" stroke="currentColor" strokeWidth="4" />
      {/* the two arced eyes, closed-happy, exactly as on the packaging */}
      <path d="M20 25c1.6-3.4 5.4-3.4 7 0" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M37 25c1.6-3.4 5.4-3.4 7 0" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M21 39c4.6 6.2 17.4 6.2 22 0" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Full lockup: smiley + the script wordmark, the way it appears on a box.
 * `.station-script` supplies Pacifico (Latin only — the Arabic name is set in
 * Tajawal beneath it).
 */
export function StationLogo({ className, showAr = true }: { className?: string; showAr?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <StationSmiley className="size-8 shrink-0" />
      <span className="leading-none">
        <span className="station-script block text-2xl">{BRAND.nameLatin}</span>
        {showAr && <span className="block text-xs font-bold opacity-80">{BRAND.nameAr}</span>}
      </span>
    </span>
  );
}

/**
 * Kept so the cafe-era screens still compile while the rebrand rolls through
 * them. Points at the Station mark, not the old coffee coin.
 * ponytail: delete once no import of StationMark remains.
 */
export const StationMark = StationSmiley;
