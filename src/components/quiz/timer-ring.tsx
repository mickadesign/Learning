"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export const TIMER_RING_RADIUS = 10;
export const TIMER_RING_CIRCUMFERENCE = 2 * Math.PI * TIMER_RING_RADIUS;

/** Mounted with a per-question key so every card starts a fresh ring. */
export function TimerRing({
  active,
  seconds,
  onTimeout,
}: {
  active: boolean;
  seconds: number;
  onTimeout: () => void;
}) {
  const [remaining, setRemaining] = useState(seconds);
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  // Carries the countdown across pauses so revealing an answer freezes it.
  const remainingRef = useRef(seconds);

  useEffect(() => {
    if (!active) return;
    const start = Date.now();
    const base = remainingRef.current;
    const id = window.setInterval(() => {
      const left = Math.max(0, base - (Date.now() - start) / 1000);
      remainingRef.current = left;
      setRemaining(left);
      if (left <= 0) {
        window.clearInterval(id);
        onTimeoutRef.current();
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [active]);

  const fraction = remaining / seconds;

  return (
    <span
      className="relative inline-flex size-9 items-center justify-center"
      role="timer"
      aria-label={`${Math.ceil(remaining)} seconds remaining`}
    >
      <svg viewBox="0 0 24 24" className="absolute inset-0 size-full -rotate-90">
        <circle
          cx="12"
          cy="12"
          r={TIMER_RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-border"
        />
        <circle
          cx="12"
          cy="12"
          r={TIMER_RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          className={cn(
            "text-foreground transition-[stroke-dashoffset] duration-100 ease-linear",
            remaining <= 5 && "text-destructive"
          )}
          strokeDasharray={TIMER_RING_CIRCUMFERENCE}
          strokeDashoffset={TIMER_RING_CIRCUMFERENCE * (1 - fraction)}
        />
      </svg>
      <span
        className={cn(
          "relative text-[11px] tabular-nums text-muted-foreground",
          remaining <= 5 && "text-destructive"
        )}
      >
        {Math.ceil(remaining)}
      </span>
    </span>
  );
}
