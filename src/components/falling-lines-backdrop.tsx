"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { useTheme } from "@/components/theme-provider";
import { prismSpectrumColor } from "@/lib/prism-spectrum";

// Values mirrored from the FallingLines shader in the reference project.
const DENSITY = 9;
const TRAIL_LENGTH = 0.53;
const SPEED = 0.022;
const SPEED_VARIANCE = 1.2;
const STROKE_WIDTH = 0.01;

interface FallingLine {
  alpha: number;
  phase: number;
  speed: number;
  trailChange: number;
  trailScale: number;
  x: number;
}

/** A small deterministic hash keeps the field stable across resizes/renders. */
function noise(index: number, salt: number) {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function makeLines(width: number, height: number): FallingLine[] {
  // Density is measured across a 1:1 field. Account for the time each trail
  // spends just outside the canvas so roughly the requested density is visible.
  const count = Math.max(
    DENSITY,
    Math.round(DENSITY * (width / Math.max(height, 1)) * (1 + TRAIL_LENGTH))
  );

  return Array.from({ length: count }, (_, index) => ({
    alpha: 0.28 + noise(index, 4) * 0.72,
    phase: noise(index, 2),
    speed: 1 - SPEED_VARIANCE / 2 + noise(index, 3) * SPEED_VARIANCE,
    // Negative values contract, positive values extend, and the middle third
    // keeps its original length as the line rises.
    trailChange:
      noise(index, 6) < 0.34
        ? -(0.35 + noise(index, 7) * 0.4)
        : noise(index, 6) > 0.66
          ? 0.35 + noise(index, 7) * 0.5
          : 0,
    // Most trails stay compact, while a few extend beyond a full viewport.
    trailScale: 0.55 + Math.pow(noise(index, 5), 1.35) * 1.75,
    // Stratification gives the shader's even-but-not-gridded distribution.
    x: ((index + 0.18 + noise(index, 1) * 0.64) / count) * width,
  }));
}

/** Sparse vertical strokes with bright leading edges and long fading trails. */
export function FallingLinesBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduceMotion = useReducedMotion();
  const { theme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let animationFrame = 0;
    let width = 0;
    let height = 0;
    let lines: FallingLine[] = [];
    let startedAt = 0;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const nextWidth = Math.round(bounds.width);
      const nextHeight = Math.round(bounds.height);
      if (nextWidth === width && nextHeight === height) return false;

      width = nextWidth;
      height = nextHeight;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      lines = makeLines(width, height);
      return true;
    };

    const draw = (now: number) => {
      resize();
      context.clearRect(0, 0, width, height);
      if (!width || !height) return;

      const elapsed = reduceMotion ? 3.5 : (now - startedAt) / 1000;
      const velocity = SPEED * height * (1 + TRAIL_LENGTH);
      const themeAlpha = theme === "dark" ? 0.92 : 0.58;

      context.lineCap = "butt";
      // The reference's 0.01 stroke resolves to a hairline at page scale.
      context.lineWidth = Math.max(1, Math.min(1.5, width * STROKE_WIDTH * 0.1));

      for (const line of lines) {
        const fullTrail = height * TRAIL_LENGTH * line.trailScale;
        const longestTrail = fullTrail * (1 + Math.max(0, line.trailChange));
        const travel = height + longestTrail;
        const progress =
          (line.phase * travel + elapsed * velocity * line.speed) % travel;
        const ascent = Math.min(1, progress / height);
        const easedAscent = ascent * ascent * (3 - 2 * ascent);
        const trail = fullTrail * (1 + line.trailChange * easedAscent);
        const head = height - progress;
        const tail = head + trail;
        const spectrumPosition = line.x / width;
        const color = prismSpectrumColor(
          spectrumPosition,
          elapsed,
          theme === "dark" ? 0.9 : 0.46,
          theme === "dark" ? 0.18 : 0.22
        );
        const gradient = context.createLinearGradient(0, tail, 0, head);
        gradient.addColorStop(0, "transparent");
        gradient.addColorStop(0.82, color);
        gradient.addColorStop(1, color);

        context.globalAlpha = themeAlpha * line.alpha;
        context.strokeStyle = gradient;
        context.beginPath();
        context.moveTo(line.x, tail);
        context.lineTo(line.x, head);
        context.stroke();
      }

      context.globalAlpha = 1;
      if (!reduceMotion) animationFrame = requestAnimationFrame(draw);
    };

    const observer = new ResizeObserver(() => {
      const resized = resize();
      if (resized && (reduceMotion || animationFrame === 0)) {
        draw(reduceMotion ? startedAt : performance.now());
      }
    });
    observer.observe(canvas);

    // Paint once immediately so the backdrop is present even before the first
    // animation frame (and remains present in throttled background tabs).
    startedAt = performance.now();
    draw(startedAt);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(animationFrame);
    };
  }, [reduceMotion, theme]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full text-foreground"
    />
  );
}
