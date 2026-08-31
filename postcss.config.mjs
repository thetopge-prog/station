/**
 * Tailwind v4 emits every rule it generates inside `@layer` — theme, base,
 * components, utilities. A browser that does not understand cascade layers
 * does not merely ignore the ordering: it discards the whole at-rule block.
 * All of it. The page then renders as bare HTML.
 *
 * That is not a hypothetical. The shop's waiting-room television — a current
 * model — showed the queue board as unstyled text in a corner. Smart-TV
 * browsers ship years behind their model year: 2024-2025 Tizen and webOS sets
 * still run Chromium 87-108, and cascade layers landed in Chromium 99.
 *
 * So the layers are flattened at build time into plain rules with equivalent
 * ordering. Modern browsers see no difference; the television sees a stylesheet
 * it can read.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    // must run AFTER Tailwind — it flattens what Tailwind emits
    "@csstools/postcss-cascade-layers": {},
  },
};

export default config;
