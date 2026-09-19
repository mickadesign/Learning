"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { useTheme } from "@/components/theme-provider";
import { prismSpectrumColor } from "@/lib/prism-spectrum";

// Values mirrored from the Prism layer in the reference project.
const INTENSITY = 1.62;
const START_FALLOFF = 0.8;
const END_FALLOFF = 0.6;
const SPLIT_X = 0.5;
const SPLIT_Y = 1.35;
const SPREAD = 1;
const SOFTNESS = 0.535;
const SATURATION = 0.89;

/** A soft spectral fan that converges at the bottom-center split point. */
export function PrismBackdrop() {
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
    let startedAt = 0;
    let lastPaint = 0;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const nextWidth = Math.round(bounds.width);
      const nextHeight = Math.round(bounds.height);
      if (nextWidth === width && nextHeight === height) return false;

      width = nextWidth;
      height = nextHeight;
      // The effect is deliberately soft, so one canvas pixel per CSS pixel is
      // enough even on Retina displays and keeps the full-viewport wash cheap.
      canvas.width = width;
      canvas.height = height;
      context.setTransform(1, 0, 0, 1, 0, 0);
      return true;
    };

    const paint = (now: number) => {
      resize();
      if (!width || !height) return;

      // The hue drift is slow; 30fps is visually identical here and avoids
      // spending a full display refresh on a deliberately blurred gradient.
      if (!reduceMotion && now - lastPaint < 1000 / 30) {
        animationFrame = requestAnimationFrame(paint);
        return;
      }
      lastPaint = now;

      context.clearRect(0, 0, width, height);
      const elapsed = reduceMotion ? 3.5 : (now - startedAt) / 1000;
      const splitX = width * SPLIT_X;
      const splitY = height * SPLIT_Y;
      const edge = 0.018 + SOFTNESS * 0.06;
      const spectrumArc = SPREAD * 0.5;
      const spectrumStart = -Math.PI / 2 - (SPREAD * Math.PI) / 2;

      // From left to right, the upper half of this conic gradient moves
      // through violet, magenta, amber, and green just like the editor layer.
      const spectrum = context.createConicGradient(spectrumStart, splitX, splitY);
      spectrum.addColorStop(0, "transparent");
      const spectrumSteps = 32;
      for (let index = 0; index <= spectrumSteps; index += 1) {
        const progress = index / spectrumSteps;
        spectrum.addColorStop(
          edge + (spectrumArc - edge * 2) * progress,
          prismSpectrumColor(
            progress,
            elapsed,
            (62 - 7 * progress) / 100,
            0.14 * SATURATION
          )
        );
      }
      spectrum.addColorStop(spectrumArc, "transparent");
      spectrum.addColorStop(1, "transparent");

      context.globalAlpha = (theme === "dark" ? 0.01 : 0.045) * INTENSITY;
      context.fillStyle = spectrum;
      context.fillRect(0, 0, width, height);

      // Fade the spectrum in just above the split point, then let it soften
      // toward the far edge of the canvas.
      context.globalCompositeOperation = "destination-in";
      context.globalAlpha = 1;
      const radius = Math.hypot(
        Math.max(splitX, width - splitX),
        Math.max(splitY, height - splitY)
      );
      const falloff = context.createRadialGradient(
        splitX,
        splitY,
        0,
        splitX,
        splitY,
        radius
      );
      falloff.addColorStop(0, "rgba(0, 0, 0, 0)");
      falloff.addColorStop(0.05, `rgba(0, 0, 0, ${1 - START_FALLOFF})`);
      falloff.addColorStop(0.18, "rgba(0, 0, 0, 0.92)");
      falloff.addColorStop(0.72, "rgba(0, 0, 0, 1)");
      falloff.addColorStop(1, `rgba(0, 0, 0, ${END_FALLOFF})`);
      context.fillStyle = falloff;
      context.fillRect(0, 0, width, height);

      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
      if (!reduceMotion) animationFrame = requestAnimationFrame(paint);
    };

    const observer = new ResizeObserver(() => {
      const resized = resize();
      if (resized && (reduceMotion || animationFrame === 0)) {
        paint(reduceMotion ? startedAt : performance.now());
      }
    });
    observer.observe(canvas);

    startedAt = performance.now();
    paint(startedAt);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(animationFrame);
    };
  }, [reduceMotion, theme]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full mix-blend-multiply dark:mix-blend-screen"
    />
  );
}
