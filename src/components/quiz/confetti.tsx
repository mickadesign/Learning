"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { spring } from "@/lib/springs";
import { cn } from "@/lib/utils";

// ── Minimalist confetti ─────────────────────────────────────
// A single burst of a couple dozen paper flecks in the site's monochrome:
// they pop out from the origin, hang for a beat, then drift down and fade.
// Transform/opacity only; skipped entirely under prefers-reduced-motion.
// Fires once per mount — key the component to replay it.

/** Flight time: five slow-tier beats. Long enough to read as falling paper,
 *  short enough to be over before the player reaches for Start. */
const FLIGHT = spring.slow.duration * 5;

interface Fleck {
  /** Apex of the burst, relative to the origin. */
  x: number;
  y: number;
  rotate: number;
  delay: number;
  width: number;
  height: number;
  tone: string;
  round: boolean;
}

const TONES = [
  "bg-foreground",
  "bg-foreground/70",
  "bg-foreground/45",
  "bg-muted-foreground/60",
];

function makeFlecks(count: number): Fleck[] {
  return Array.from({ length: count }, (_, i) => {
    // Fan across the upper half so the burst reads as thrown up and out,
    // spread evenly with a little jitter so it never looks like a grid.
    const angle =
      Math.PI + (Math.PI * (i + 0.5)) / count + (Math.random() - 0.5) * 0.4;
    const radius = 70 + Math.random() * 90;
    const round = Math.random() < 0.35;
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      rotate: (Math.random() - 0.5) * 540,
      delay: Math.random() * 0.06,
      width: round ? 4 : 4 + Math.random() * 2,
      height: round ? 4 : 8 + Math.random() * 4,
      tone: TONES[i % TONES.length],
      round,
    };
  });
}

export function Confetti({
  count = 22,
  className,
  originY = "50%",
}: {
  count?: number;
  /** Sizes and places the clipping box; defaults to the parent's bounds. */
  className?: string;
  /** Where the burst starts, vertically, inside that box. */
  originY?: string;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const flecks = useMemo(() => makeFlecks(count), [count]);
  if (reduceMotion) return null;

  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className
      )}
    >
      {flecks.map((f, i) => (
        <motion.span
          key={i}
          className={cn(
            "absolute left-1/2 block",
            f.tone,
            f.round ? "rounded-full" : "rounded-[1px]"
          )}
          style={{ width: f.width, height: f.height, top: originY }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 0, scale: 0.4 }}
          animate={{
            // Out fast, then a slow drift as gravity takes over.
            x: [0, f.x * 0.85, f.x, f.x * 1.1],
            y: [0, f.y, f.y * 0.35 + 30, 170],
            rotate: [0, f.rotate * 0.6, f.rotate, f.rotate * 1.3],
            opacity: [0, 1, 1, 0],
            scale: [0.4, 1, 1, 1],
          }}
          transition={{
            delay: f.delay,
            x: {
              duration: FLIGHT,
              times: [0, 0.22, 0.6, 1],
              ease: ["circOut", "linear", "linear"],
            },
            y: {
              duration: FLIGHT,
              times: [0, 0.22, 0.6, 1],
              ease: ["circOut", "easeIn", "easeIn"],
            },
            rotate: { duration: FLIGHT, ease: "linear" },
            opacity: {
              duration: FLIGHT,
              times: [0, 0.05, 0.7, 1],
              ease: "linear",
            },
            scale: {
              duration: FLIGHT,
              times: [0, 0.12, 0.7, 1],
              ease: "circOut",
            },
          }}
        />
      ))}
    </span>
  );
}
