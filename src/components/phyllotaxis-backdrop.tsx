"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { useReducedMotion } from "framer-motion";
import { useTheme } from "@/components/theme-provider";
import { prismSpectrumColor } from "@/lib/prism-spectrum";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 *    0ms   paint 1,400 evenly spaced dots past every viewport corner
 * ongoing  rotate the field while every dot gently pulsates
 * sporadic send one fast knowledge pulse along a dotted arm
 * reduced  freeze the field at a representative resting frame
 * ───────────────────────────────────────────────────────── */

// Equal-area geometry from the linked Caustic "Golden Bloom" reference,
// expanded past the viewport corners and paired with one shared pulse.
const PHYLLOTAXIS = {
  count: 1_400,
  rotation: 0.02,
  pulseSpeed: 0.72,
  pulse: 0.24,
  minimumOpacity: 0,
  dotSize: 1.5,
  trail: 0,
  twist: 0,
  speed: 1,
  goldenAngle: 2.399963229728653,
  radialOffset: 0.5,
  cornerOverscan: 1.12,
  prismSteps: 16,
  crispRadiusScale: 0.72,
  minimumRadius: 0.65,
  maxPixelRatio: 3,
  frozenAtSeconds: 3.5,
} as const;

const KNOWLEDGE_PULSES = {
  maxVisible: 1,
  trailPoints: 6,
  lineWidth: 0.85,
  maximumOpacity: 0.9,
  curveSubdivisions: 8,
  paths: [
    {
      startIndex: 342,
      stride: 89,
      pointCount: 12,
      direction: 1,
      cycleSeconds: 11.5,
      activeSeconds: 2.4,
      phaseSeconds: 0.3,
    },
    {
      startIndex: 404,
      stride: 89,
      pointCount: 12,
      direction: -1,
      cycleSeconds: 13.75,
      activeSeconds: 2.2,
      phaseSeconds: 4.4,
    },
    {
      startIndex: 288,
      stride: 55,
      pointCount: 20,
      direction: 1,
      cycleSeconds: 16.25,
      activeSeconds: 2.4,
      phaseSeconds: 9.1,
    },
    {
      startIndex: 460,
      stride: 55,
      pointCount: 18,
      direction: -1,
      cycleSeconds: 18.5,
      activeSeconds: 2.6,
      phaseSeconds: 14.2,
    },
    {
      startIndex: 264,
      stride: 55,
      pointCount: 11,
      direction: -1,
      cycleSeconds: 10.75,
      activeSeconds: 2.2,
      phaseSeconds: 0.9,
    },
    {
      startIndex: 358,
      stride: 55,
      pointCount: 11,
      direction: 1,
      cycleSeconds: 14.4,
      activeSeconds: 2.4,
      phaseSeconds: 1.6,
    },
    {
      startIndex: 295,
      stride: 89,
      pointCount: 8,
      direction: -1,
      cycleSeconds: 17.6,
      activeSeconds: 2.4,
      phaseSeconds: 0.1,
    },
    {
      startIndex: 389,
      stride: 89,
      pointCount: 8,
      direction: 1,
      cycleSeconds: 20.3,
      activeSeconds: 2.6,
      phaseSeconds: 12.7,
    },
  ],
} as const;

function catmullRom(
  previous: number,
  start: number,
  end: number,
  next: number,
  progress: number
) {
  const squared = progress * progress;
  const cubed = squared * progress;
  return (
    0.5 *
    (2 * start +
      (-previous + end) * progress +
      (2 * previous - 5 * start + 4 * end - next) * squared +
      (-previous + 3 * start - 3 * end + next) * cubed)
  );
}

const THEME_COLORS = {
  dark: {
    background: "#050508",
    dotLightness: 0.9,
    dotChroma: 0.18,
  },
  // In light mode the field and spectrum contrast invert together. The
  // background matches the page substrate at the clear mask.
  light: {
    background: "#fafafa",
    dotLightness: 0.62,
    dotChroma: 0.28,
  },
} as const;

// Fade the effect away behind the central content, then bring it back toward
// the viewport edges. Both properties are needed for Safari/WebKit.
const CENTER_MASK_GRADIENT =
  "radial-gradient(ellipse at center, transparent 0%, transparent 42%, rgb(0 0 0 / 0.12) 54%, rgb(0 0 0 / 0.72) 72%, black 88%)";

const CENTER_MASK: CSSProperties = {
  WebkitMaskImage: CENTER_MASK_GRADIENT,
  maskImage: CENTER_MASK_GRADIENT,
};

/** A slowly rotating golden-angle field with a readable, masked center. */
export function PhyllotaxisBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduceMotion = useReducedMotion();
  const { theme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    const colors = THEME_COLORS[theme];
    const dotLayer = document.createElement("canvas");
    const dotContext = dotLayer.getContext("2d", { alpha: true });
    if (!dotContext) return;

    let animationFrame = 0;
    let width = 0;
    let height = 0;
    let startedAt = 0;
    const pointX = new Float32Array(PHYLLOTAXIS.count);
    const pointY = new Float32Array(PHYLLOTAXIS.count);

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const nextWidth = Math.round(bounds.width);
      const nextHeight = Math.round(bounds.height);
      if (nextWidth === width && nextHeight === height) return false;

      width = nextWidth;
      height = nextHeight;
      const pixelRatio = Math.min(
        window.devicePixelRatio || 1,
        PHYLLOTAXIS.maxPixelRatio
      );
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      dotLayer.width = canvas.width;
      dotLayer.height = canvas.height;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      dotContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.imageSmoothingEnabled = true;
      dotContext.imageSmoothingEnabled = true;
      return true;
    };

    const paint = (now: number) => {
      resize();
      if (!width || !height) return;

      const elapsed = reduceMotion
        ? PHYLLOTAXIS.frozenAtSeconds
        : ((now - startedAt) / 1_000) * PHYLLOTAXIS.speed;
      const fieldSize = Math.min(width, height);
      const fieldRadius =
        Math.hypot(width / 2, height / 2) * PHYLLOTAXIS.cornerOverscan;
      const baseDotSize = (PHYLLOTAXIS.dotSize * fieldSize) / 900;
      const pulsePhase = Math.sin(elapsed * PHYLLOTAXIS.pulseSpeed);
      const pulseProgress = (pulsePhase + 1) / 2;
      const pulseScale = 1 + PHYLLOTAXIS.pulse * pulsePhase;
      const pulseOpacity =
        PHYLLOTAXIS.minimumOpacity +
        (1 - PHYLLOTAXIS.minimumOpacity) * pulseProgress;

      // A zero trail means the field is fully repainted on every frame.
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 1 - PHYLLOTAXIS.trail;
      context.fillStyle = colors.background;
      context.fillRect(0, 0, width, height);

      dotContext.clearRect(0, 0, width, height);
      dotContext.globalCompositeOperation = "source-over";
      dotContext.fillStyle = "white";

      for (let index = 0; index < PHYLLOTAXIS.count; index += 1) {
        const normalizedRadius = Math.sqrt(
          (index + PHYLLOTAXIS.radialOffset) / PHYLLOTAXIS.count
        );
        const radius = fieldRadius * normalizedRadius;
        const angle =
          index * PHYLLOTAXIS.goldenAngle +
          elapsed * PHYLLOTAXIS.rotation +
          PHYLLOTAXIS.twist * normalizedRadius * Math.PI;
        const dotRadius = baseDotSize * pulseScale;
        if (dotRadius <= 0) continue;

        const crispRadius = Math.max(
          PHYLLOTAXIS.minimumRadius,
          dotRadius * PHYLLOTAXIS.crispRadiusScale
        );
        const x = width / 2 + radius * Math.cos(angle);
        const y = height / 2 + radius * Math.sin(angle);
        pointX[index] = x;
        pointY[index] = y;

        dotContext.globalAlpha = pulseOpacity;
        dotContext.beginPath();
        dotContext.arc(x, y, crispRadius, 0, Math.PI * 2);
        dotContext.fill();
      }

      // Color the dot mask with the shared Prism spectrum while leaving the
      // canvas background calm.
      dotContext.globalAlpha = 1;
      dotContext.globalCompositeOperation = "source-in";
      const prism = dotContext.createLinearGradient(0, 0, width, 0);
      for (let step = 0; step <= PHYLLOTAXIS.prismSteps; step += 1) {
        const progress = step / PHYLLOTAXIS.prismSteps;
        prism.addColorStop(
          progress,
          prismSpectrumColor(
            progress,
            elapsed,
            colors.dotLightness,
            colors.dotChroma
          )
        );
      }
      dotContext.fillStyle = prism;
      dotContext.fillRect(0, 0, width, height);
      dotContext.globalCompositeOperation = "source-over";

      // Fibonacci strides follow the natural parastichy arms in the dot field.
      // The same gradient colors both the strokes and their surrounding dots.
      let visiblePulses = 0;
      dotContext.lineCap = "round";
      dotContext.lineJoin = "round";
      dotContext.strokeStyle = prism;
      dotContext.lineWidth =
        KNOWLEDGE_PULSES.lineWidth * (fieldSize / 900) * pulseScale;

      for (const path of KNOWLEDGE_PULSES.paths) {
        if (visiblePulses >= KNOWLEDGE_PULSES.maxVisible) break;

        const cycleTime =
          (elapsed + path.phaseSeconds) % path.cycleSeconds;
        if (cycleTime >= path.activeSeconds) continue;

        const travelProgress = cycleTime / path.activeSeconds;
        const segmentCount = path.pointCount - 1;
        const head =
          travelProgress *
            (segmentCount + KNOWLEDGE_PULSES.trailPoints * 2) -
          KNOWLEDGE_PULSES.trailPoints;
        const tail = head - KNOWLEDGE_PULSES.trailPoints;
        const visibleStart = Math.max(0, tail);
        const visibleEnd = Math.min(segmentCount, head);
        if (visibleEnd <= visibleStart) continue;

        visiblePulses += 1;
        dotContext.globalAlpha =
          KNOWLEDGE_PULSES.maximumOpacity * pulseOpacity;
        dotContext.beginPath();
        let hasCurvePoint = false;

        for (
          let segment = Math.floor(visibleStart);
          segment < Math.ceil(visibleEnd);
          segment += 1
        ) {
          if (segment < 0 || segment >= segmentCount) continue;

          const localStart = Math.max(visibleStart, segment) - segment;
          const localEnd = Math.min(visibleEnd, segment + 1) - segment;
          const pointIndexForStep = (step: number) => {
            const boundedStep = Math.min(segmentCount, Math.max(0, step));
            const movementStep =
              path.direction === 1
                ? boundedStep
                : segmentCount - boundedStep;
            return path.startIndex + path.stride * movementStep;
          };
          const previousIndex = pointIndexForStep(segment - 1);
          const startIndex = pointIndexForStep(segment);
          const endIndex = pointIndexForStep(segment + 1);
          const nextIndex = pointIndexForStep(segment + 2);
          const curveSamples = Math.max(
            1,
            Math.ceil(
              (localEnd - localStart) *
                KNOWLEDGE_PULSES.curveSubdivisions
            )
          );
          for (let sample = 0; sample <= curveSamples; sample += 1) {
            const curveProgress =
              localStart +
              ((localEnd - localStart) * sample) / curveSamples;
            const x = catmullRom(
              pointX[previousIndex],
              pointX[startIndex],
              pointX[endIndex],
              pointX[nextIndex],
              curveProgress
            );
            const y = catmullRom(
              pointY[previousIndex],
              pointY[startIndex],
              pointY[endIndex],
              pointY[nextIndex],
              curveProgress
            );
            if (!hasCurvePoint) {
              dotContext.moveTo(x, y);
              hasCurvePoint = true;
            }
            else dotContext.lineTo(x, y);
          }
        }

        if (hasCurvePoint) dotContext.stroke();
      }

      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
      context.drawImage(dotLayer, 0, 0, width, height);
      if (!reduceMotion) animationFrame = requestAnimationFrame(paint);
    };

    const observer = new ResizeObserver(() => {
      const resized = resize();
      if (resized && reduceMotion) paint(startedAt);
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
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full"
      style={{ backgroundColor: THEME_COLORS[theme].background }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full"
        style={CENTER_MASK}
      />
    </div>
  );
}
