import localFont from "next/font/local";

// Both faces are self-hosted and open-licensed (SIL OFL; see src/fonts).
// Inter Variable carries the `opsz` optical-size axis Fluid Functionalism's
// weight animations rely on; `font-optical-sizing: auto` picks it up.
export const inter = localFont({
  src: "../fonts/InterVariable.woff2",
  variable: "--font-sans",
  weight: "100 900",
  display: "swap",
});

// Instrument Serif — the display serif for headings, level names, and the
// big score. Swap in your own by changing this file (and the OG image's
// font, in src/app/s/[level]/[score]/opengraph-image.tsx).
export const heading = localFont({
  src: "../fonts/InstrumentSerif-Regular.ttf",
  variable: "--font-heading",
  weight: "400",
  display: "swap",
  fallback: ["Georgia", "serif"],
});
