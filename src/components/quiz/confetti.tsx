"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "framer-motion";
import createConfetti from "canvas-confetti";
import { spring } from "@/lib/springs";

// ── Minimalist fireworks ────────────────────────────────────
// A short volley of small bursts — every quarter second, two bursts from
// random points in the left and right thirds of the box, each a little
// thinner than the last — in the site's monochrome: the theme's foreground
// mixed toward the background in three steps. Drawn by canvas-confetti on a
// canvas portaled to the body and fixed over the whole viewport, above the
// quiz panel, so the volley fills the page wherever it is mounted. Skipped
// under reduced motion. Fires once per mount — key the component to replay.

/** The whole volley: a dozen slow-tier beats. */
const DURATION_MS = spring.slow.duration * 12 * 1000;
/** Time between volleys, in ms. */
const INTERVAL_MS = 250;
/** Particles per burst at the start; each later burst carries fewer. */
const PARTICLES = 22;

/** Any CSS color → [r, g, b], by painting one pixel with it and reading
 *  the pixel back: computed theme colors come back as `oklch(…)` or
 *  `lab(…)`, which neither a regex on "rgb(" nor a fillStyle round-trip
 *  turns into numbers. Null when the canvas can't paint it. */
function rgb(color: string): [number, number, number] | null {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = "#010203";
  ctx.fillStyle = color;
  if (ctx.fillStyle === "#010203" && color !== "#010203") return null;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

/** `amount` of `a` over `b`, as hex (canvas-confetti takes hex only). */
function mix(a: [number, number, number], b: [number, number, number], amount: number): string {
  return (
    "#" +
    a
      .map((v, i) => Math.round(v * amount + b[i] * (1 - amount)))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Three tones of the current theme's foreground, read off the canvas
 *  itself (it carries `text-foreground`) so dark mode gets light flecks. */
function tones(canvas: HTMLCanvasElement): string[] {
  const fg = rgb(getComputedStyle(canvas).color) ?? [0, 0, 0];
  const bg = rgb(getComputedStyle(document.body).backgroundColor) ?? [255, 255, 255];
  return [mix(fg, bg, 1), mix(fg, bg, 0.7), mix(fg, bg, 0.45)];
}

/** How long after the last burst the last flecks can still be falling. */
const SETTLE_MS = 1500;

export function Confetti() {
  const reduceMotion = useReducedMotion() ?? false;
  const ref = useRef<HTMLCanvasElement>(null);
  // The canvas leaves once the volley is over rather than sitting over the
  // page (a viewport-sized layer) for as long as the parent keeps it.
  const [over, setOver] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || reduceMotion) return;
    const fire = createConfetti.create(canvas, { resize: true, useWorker: false });
    const colors = tones(canvas);
    const end = Date.now() + DURATION_MS;
    const between = (min: number, max: number) => Math.random() * (max - min) + min;
    const burst = (x: number, count: number) =>
      fire({
        particleCount: count,
        startVelocity: 30,
        spread: 360,
        ticks: 70,
        gravity: 0.9,
        scalar: 0.8,
        colors,
        shapes: ["square", "circle"],
        origin: { x, y: between(0.1, 0.6) },
        // Reduced motion is handled above; this is belt and braces.
        disableForReducedMotion: true,
      });
    const volley = () => {
      const left = end - Date.now();
      if (left <= 0) {
        clearInterval(interval);
        return;
      }
      const count = Math.max(4, Math.round(PARTICLES * (left / DURATION_MS)));
      burst(between(0.1, 0.3), count);
      burst(between(0.7, 0.9), count);
    };
    volley();
    const interval = window.setInterval(volley, INTERVAL_MS);
    const settle = window.setTimeout(() => {
      clearInterval(interval);
      fire.reset();
      setOver(true);
    }, DURATION_MS + SETTLE_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(settle);
      fire.reset();
    };
  }, [reduceMotion]);

  if (over || reduceMotion || typeof document === "undefined") return null;

  return createPortal(
    <canvas
      ref={ref}
      aria-hidden
      // Above the quiz panel (z-50) and its backdrop.
      className="pointer-events-none fixed inset-0 z-[60] size-full text-foreground"
    />,
    document.body
  );
}
