"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useIsPresent, useReducedMotion } from "framer-motion";
import { spring } from "@/lib/springs";

// ── The wandering cursor ────────────────────────────────────
// A stand-in for the agent's hand while it writes: the site's own cursor
// (micka.design's arrow, white with a black stroke) at three times the
// size, drifting slowly from one random spot of the viewport to the next
// and resting a while at each.
// Fixed over the page and portaled to the body so no transformed ancestor
// can pin it; never in the way (pointer-events: none). Skipped under
// reduced motion — a giant static arrow would only puzzle.

const WIDTH = 60;
const HEIGHT = 72;

/** One leg of the walk: fifteen to twenty-five slow-tier beats. Slow
 *  enough to read as idle drifting rather than a pointer looking for
 *  something to click. */
const LEG_S = () => spring.slow.duration * (15 + Math.random() * 10);
/** The rest before setting off again: six to fourteen slow-tier beats. */
const PAUSE_S = () => spring.slow.duration * (6 + Math.random() * 8);

/** A random point inside the viewport, kept off its edges. */
function somewhere(): { x: number; y: number } {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return {
    x: w * 0.12 + Math.random() * (w * 0.76 - WIDTH),
    y: h * 0.12 + Math.random() * (h * 0.76 - HEIGHT),
  };
}

export function WanderingCursor() {
  const reduceMotion = useReducedMotion() ?? false;
  const [target, setTarget] = useState(() =>
    typeof window === "undefined" ? { x: 0, y: 0 } : somewhere()
  );
  const [leg, setLeg] = useState(LEG_S);
  const [pause, setPause] = useState(PAUSE_S);
  // onAnimationComplete also fires for the exit fade; an element on its way
  // out doesn't pick a new destination.
  const present = useIsPresent();
  const next = useCallback(() => {
    if (!present) return;
    setTarget(somewhere());
    setLeg(LEG_S());
    setPause(PAUSE_S());
  }, [present]);

  if (reduceMotion || typeof document === "undefined") return null;

  return createPortal(
    <motion.div
      aria-hidden
      // Above the page and the quiz panel (z-50), beside the fireworks.
      className="pointer-events-none fixed left-0 top-0 z-[60]"
      style={{ width: WIDTH, height: HEIGHT }}
      initial={{ x: target.x, y: target.y, opacity: 0 }}
      animate={{ x: target.x, y: target.y, opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: spring.moderate.exit.duration } }}
      transition={{
        x: { duration: leg, delay: pause, ease: "easeInOut" },
        y: { duration: leg, delay: pause, ease: "easeInOut" },
        opacity: { duration: spring.slow.duration },
      }}
      onAnimationComplete={next}
    >
      <svg width={WIDTH} height={HEIGHT} viewBox="0 0 20 24">
        <path
          d="M1 1l0 19.2 5.5-5.3 3.6 8.1 2.9-1.3-3.6-8.1H17z"
          fill="white"
          stroke="black"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    </motion.div>,
    document.body
  );
}
