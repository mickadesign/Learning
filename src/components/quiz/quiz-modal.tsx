"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  shareTextFor,
  verdictFor,
  type ChoiceQuestion,
  type Deck,
  type ImageCredit,
  type OrderItem,
  type OrderQuestion,
  type QuizQuestion,
  type TrueFalseQuestion,
} from "@/lib/deck";
import { Button } from "@/components/ui/button";
import { Confetti } from "@/components/quiz/confetti";
import {
  TIMER_RING_CIRCUMFERENCE,
  TIMER_RING_RADIUS,
  TimerRing,
} from "@/components/quiz/timer-ring";
import { useProximityHover, type ItemRect } from "@/hooks/use-proximity-hover";
import { useTouchPrimary } from "@/hooks/use-touch-primary";
import { deckThumbnails } from "@/lib/deck-thumbnails";
import { useIcon, type IconComponent } from "@/lib/icon-context";
import { spring } from "@/lib/springs";
import { surfaceClasses } from "@/lib/surface-classes";
import { cn } from "@/lib/utils";

// ── Progress persistence ────────────────────────────────────
// Same pattern as the theme preference: a small localStorage blob, guarded so
// private-mode/blocked storage degrades to session-only progress. Keyed by the
// deck slug (`<slug>-quiz-v1`) so two decks on one origin don't share scores.

type BestScores = Partial<Record<string, number>>;

function loadBest(key: string): BestScores {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { best?: BestScores };
    return parsed.best ?? {};
  } catch {
    return {};
  }
}

function saveBest(key: string, best: BestScores) {
  try {
    localStorage.setItem(key, JSON.stringify({ best }));
  } catch {}
}

// ── Per-run shuffling ───────────────────────────────────────

function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A question prepared for one run: options/items pre-shuffled. */
interface RunQuestion {
  q: QuizQuestion;
  /** kind "choice": shuffled options + where the correct one landed. */
  options?: string[];
  correctIndex?: number;
  /** kind "order": shuffled display order (never the already-correct one). */
  items?: OrderItem[];
}

function buildRun(questions: QuizQuestion[]): RunQuestion[] {
  return shuffle(questions).map((q) => {
    if (q.kind === "choice") {
      const options = shuffle(q.options);
      return { q, options, correctIndex: options.indexOf(q.options[0]) };
    }
    if (q.kind === "order") {
      let items = shuffle(q.items);
      // Don't hand the player a pre-solved card.
      while (items.every((it, i) => it === q.items[i])) items = shuffle(q.items);
      return { q, items };
    }
    return { q };
  });
}

// ── Motion vocabulary ───────────────────────────────────────
// Each new card slides in from the right and dissolves into place. Enter-only
// on a key-remount — no exit choreography, so a swap can never hang on an
// interrupted exit animation.

const cardEnter = { opacity: 0, x: 36 };
const cardCenter = { opacity: 1, x: 0 };
// spring.slow carries an `exit` key that isn't a real transition field — strip
// it so framer-motion sees a clean spring config.
const cardSpring = {
  type: "spring" as const,
  duration: spring.slow.duration,
  bounce: spring.slow.bounce,
};

// ── Answer-row styling (choice + true/false) ────────────────

function answerRowClass(
  state: "idle" | "correct" | "wrong" | "dimmed",
  /** Fluid proximity hover: when defined, the floating background handles
   *  hover and this only drives the border highlight. Undefined keeps the
   *  plain CSS hover (order chips). */
  proximityActive?: boolean
) {
  return cn(
    "relative flex w-full items-center justify-between gap-3 rounded-full border px-4 py-3 text-left text-[14px] transition-colors duration-80",
    state === "idle" && "cursor-pointer border-border text-foreground active:bg-active",
    state === "idle" && proximityActive === undefined && "hover:bg-hover",
    state === "correct" && "border-transparent bg-foreground text-background",
    state === "wrong" &&
      // The shake plays once as the row enters its wrong state; skipped
      // under prefers-reduced-motion.
      "border-destructive/20 bg-destructive/10 text-destructive motion-safe:animate-[quiz-shake_0.25s_ease-in-out]",
    state === "dimmed" && "border-border text-muted-foreground opacity-50"
  );
}

// ── Cards ───────────────────────────────────────────────────

interface CardProps {
  revealed: boolean;
  onResolve: (correct: boolean) => void;
  /** Number-key handler slot; the modal routes 1–9 presses through it. */
  keyRef: MutableRefObject<((n: number) => void) | null>;
  /** Desktop-only "1 2 3" hints on the right of each answer. */
  showKeyHints: boolean;
}

/** Check mark that draws itself in (Fluid Functionalism checkbox pathLength
 *  technique), held back a beat so it lands as the row settles, then drawn
 *  a touch slower for emphasis. */
function DrawnCheck({ size = 24 }: { size?: number }) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      // Overhang vertically instead of stretching the row taller than the
      // idle state's text line.
      className="-my-1"
      aria-hidden
    >
      <motion.path
        d="M6 12L10 16L18 8"
        initial={{ pathLength: 0 }}
        animate={{
          pathLength: 1,
          transition: { duration: 0.24, delay: 0.15, ease: "easeOut" },
        }}
      />
    </motion.svg>
  );
}

/** The fluid hover: one floating background that springs between answer
 *  rows, following pointer proximity (the Fluid Functionalism card hover). */
function HoverGlideBg({ rect }: { rect: ItemRect }) {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 rounded-full bg-hover"
      initial={false}
      animate={{ top: rect.top, height: rect.height }}
      // Card proximity sits in the fast tier (0.08s) per the FF motion map —
      // the glide should feel like it's pinned to the cursor.
      transition={{
        type: "spring",
        duration: spring.fast.duration,
        bounce: 0,
      }}
    />
  );
}

/** One odometer column: a 0-9 strip that springs to the current digit, so
 *  only the digit that changes rolls. Fixed to one numeral width. */
function DigitColumn({
  digit,
  blankZero,
}: {
  digit: number;
  /** Leading column: render the 0 cell empty so "9" has no ghost tens. */
  blankZero?: boolean;
}) {
  // Continuous strip position: every countdown step adds +1 (moves the strip
  // up), including the 0 -> 9 wrap — the strip holds two cycles and snaps
  // back a cycle, without animating, once the roll completes.
  const [pos, setPos] = useState(() => 9 - digit);
  const prevDigitRef = useRef(digit);
  const snapRef = useRef(false);

  useEffect(() => {
    if (digit === prevDigitRef.current) return;
    let delta = prevDigitRef.current - digit;
    prevDigitRef.current = digit;
    if (delta <= -9) delta += 10; // 0 -> 9 keeps rolling upward
    snapRef.current = false;
    setPos((p) => p + delta);
  }, [digit]);

  return (
    <span className="relative h-[28px] w-[1ch] overflow-hidden">
      <motion.span
        className="flex flex-col"
        initial={false}
        animate={{ y: -pos * 28 }}
        transition={
          snapRef.current
            ? { duration: 0 }
            : {
                type: "spring",
                duration: spring.moderate.duration,
                bounce: 0,
              }
        }
        onAnimationComplete={() => {
          if (pos >= 10) {
            snapRef.current = true;
            setPos(pos - 10);
          } else if (pos < 0) {
            snapRef.current = true;
            setPos(pos + 10);
          }
        }}
      >
        {Array.from({ length: 20 }, (_, i) => 9 - (i % 10)).map((d, i) => (
          <span
            key={i}
            className="flex h-[28px] items-center justify-center leading-none"
          >
            {blankZero && d === 0 ? "" : d}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/** Briefing slide for timed levels: a large clock looping from the level's
 *  full countdown to zero until the player presses Start. */
function TimedIntro({ seconds }: { seconds: number }) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      setRemaining(seconds - (elapsed % seconds));
    }, 100);
    return () => clearInterval(id);
  }, [seconds]);

  const frac = remaining / seconds;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{
        opacity: 1,
        y: 0,
        transition: { duration: spring.moderate.duration, ease: "easeOut" },
      }}
      className="flex flex-col items-center text-center"
    >
      <span
        className="relative flex size-24 items-center justify-center"
        role="timer"
        aria-label={`${seconds} seconds per card`}
      >
        <svg
          viewBox="0 0 24 24"
          className="absolute inset-0 size-full -rotate-90"
        >
          <circle
            cx="12"
            cy="12"
            r={TIMER_RING_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.75"
            className="text-border"
          />
          <circle
            cx="12"
            cy="12"
            r={TIMER_RING_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.75"
            strokeLinecap="round"
            className={cn(
              "text-foreground transition-[stroke-dashoffset] duration-100 ease-linear",
              remaining <= 5 && "text-destructive"
            )}
            strokeDasharray={TIMER_RING_CIRCUMFERENCE}
            strokeDashoffset={TIMER_RING_CIRCUMFERENCE * (1 - frac)}
          />
        </svg>
        {/* Rolling countdown, odometer style: independent digit columns so
            only the digit that changes rolls (transform-only). */}
        <motion.span
          className={cn(
            "relative flex font-heading text-[28px] tabular-nums text-foreground",
            remaining <= 5 && "text-destructive"
          )}
          aria-hidden
          initial={false}
          // With the tens column blank (single digit), shift half a numeral
          // so the visible digit sits dead center in the ring; nudged 2px
          // down for optical centering.
          animate={{
            x:
              seconds >= 10 && Math.max(1, Math.ceil(remaining)) < 10
                ? "-0.5ch"
                : "0ch",
            y: 2,
          }}
          transition={{
            type: "spring",
            duration: spring.moderate.duration,
            bounce: 0,
          }}
        >
          {seconds >= 10 && (
            <DigitColumn
              digit={Math.floor(Math.max(1, Math.ceil(remaining)) / 10)}
              blankZero
            />
          )}
          <DigitColumn digit={Math.max(1, Math.ceil(remaining)) % 10} />
        </motion.span>
      </span>
      <h2 className="mt-8 font-heading text-[28px] leading-none text-foreground">
        {seconds} seconds to answer
      </h2>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
        Run out and it counts as wrong.
      </p>
    </motion.div>
  );
}

/** Museum label for a card's picture: title, author, license, source.
 *  Overlaid on the image's bottom edge so it never shifts the card, and
 *  only once the answer is out — before that the title could give it away.
 *  Fades in on the fact's beat (0.28s after the rows collapse). */
function ImageCaption({ credit }: { credit?: ImageCredit }) {
  if (!credit || !(credit.title || credit.author)) return null;
  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{
        opacity: 1,
        transition: { duration: spring.moderate.duration, delay: 0.28, ease: "easeOut" },
      }}
      className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 pb-2 pt-8 text-[12px] leading-snug text-white/90"
    >
      {credit.title}
      {credit.author && ` — ${credit.author}`}
      {credit.license && ` · ${credit.license}`}
      {credit.source && (
        <>
          {" · "}
          <a
            href={credit.source}
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto underline decoration-white/40 underline-offset-2 transition-colors duration-80 hover:decoration-white"
          >
            Source
          </a>
        </>
      )}
    </motion.p>
  );
}

/** The X logomark — none of the icon libraries carry it, so it's inlined.
 *  Shaped as an IconComponent so Button's `leadingIcon` slot accepts it; the
 *  glyph is inset 10% to optically match the stroke icons' built-in padding. */
const XLogo: IconComponent = ({ size = 14, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden
  >
    <g transform="translate(2.4 2.4) scale(0.8)">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
    </g>
  </svg>
);

/** Subtle keyboard-shortcut label on the right edge of an answer row. */
function KeyHint({ n }: { n: number }) {
  return (
    <span className="text-[12px] tabular-nums text-muted-foreground/60">
      {n}
    </span>
  );
}

function ChoiceCard({
  rq,
  revealed,
  onResolve,
  keyRef,
  showKeyHints,
}: CardProps & { rq: RunQuestion }) {
  const q = rq.q as ChoiceQuestion;
  const options = rq.options!;
  const correctIndex = rq.correctIndex!;
  const [selected, setSelected] = useState<number | null>(null);
  const XIcon = useIcon("x");
  const answersRef = useRef<HTMLDivElement>(null);
  const { activeIndex, itemRects, handlers, registerItem } =
    useProximityHover(answersRef);

  useEffect(() => {
    keyRef.current = (n) => {
      const i = n - 1;
      if (revealed || i >= options.length) return;
      setSelected(i);
      onResolve(i === correctIndex);
    };
    return () => {
      keyRef.current = null;
    };
  });

  // "Reveal" questions show their image up front but heavily blurred — it
  // sharpens the moment the answer lands.
  const displayImage = q.image ?? q.revealImage;
  const blurred = !q.image && !!q.revealImage && !revealed;

  return (
    <div className="space-y-4">
      {displayImage && (
        <div className="relative aspect-[16/10] overflow-hidden rounded-[8px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayImage}
            alt={q.imageAlt ?? "Image for this question"}
            loading="eager"
            className={cn(
              "size-full object-cover transition-[filter,transform] duration-[600ms] ease-out",
              blurred ? "scale-105 blur-xl" : "scale-100 blur-0"
            )}
          />
          {revealed && <ImageCaption credit={q.imageCredit} />}
        </div>
      )}
      <p className="text-[19px] leading-snug text-foreground">{q.prompt}</p>
      <div
        ref={answersRef}
        className="relative"
        role="group"
        aria-label="Answers"
        {...handlers}
      >
        {!revealed && activeIndex !== null && itemRects[activeIndex] && (
          <HoverGlideBg rect={itemRects[activeIndex]} />
        )}
        {options.map((opt, i) => {
          const state = !revealed
            ? "idle"
            : i === correctIndex
              ? "correct"
              : i === selected
                ? "wrong"
                : "dimmed";
          return (
            // After the reveal, untouched wrong options collapse away (a CSS
            // grid-track animation — reliable even in throttled tabs) so the
            // fact below glides up into the room.
            <div
              key={opt}
              ref={(el) => registerItem(i, el)}
              aria-hidden={state === "dimmed"}
              className={cn(
                "grid [transition:opacity_100ms_ease-out,grid-template-rows_220ms_cubic-bezier(0.77,0,0.175,1)_60ms,margin_220ms_cubic-bezier(0.77,0,0.175,1)_60ms]",
                state === "dimmed"
                  ? "mb-0 grid-rows-[0fr] opacity-0"
                  : "mb-1.5 grid-rows-[1fr] opacity-100 last:mb-0"
              )}
            >
              <div className="min-h-0 overflow-y-clip">
                <button
                  type="button"
                  disabled={revealed}
                  className={answerRowClass(state, activeIndex === i)}
                  onClick={() => {
                    setSelected(i);
                    onResolve(i === correctIndex);
                  }}
                >
                  <span>{opt}</span>
                  {state === "correct" && <DrawnCheck />}
                  {state === "wrong" && (
                    <span className="-my-1 flex size-6 items-center justify-center">
                      <XIcon size={20} strokeWidth={1.5} />
                    </span>
                  )}
                  {state === "idle" && showKeyHints && <KeyHint n={i + 1} />}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrueFalseCard({
  rq,
  revealed,
  onResolve,
  keyRef,
  showKeyHints,
}: CardProps & { rq: RunQuestion }) {
  const q = rq.q as TrueFalseQuestion;
  const [selected, setSelected] = useState<boolean | null>(null);
  const XIcon = useIcon("x");
  const answersRef = useRef<HTMLDivElement>(null);
  const { activeIndex, itemRects, handlers, registerItem } =
    useProximityHover(answersRef);

  useEffect(() => {
    keyRef.current = (n) => {
      if (revealed || n > 2) return;
      const value = n === 1;
      setSelected(value);
      onResolve(value === q.answer);
    };
    return () => {
      keyRef.current = null;
    };
  });

  const blurred = !!q.revealImage && !revealed;

  return (
    <div className="space-y-4">
      {q.revealImage && (
        <div className="relative aspect-[16/10] overflow-hidden rounded-[8px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={q.revealImage}
            alt={q.imageAlt ?? "Image for this question"}
            loading="eager"
            className={cn(
              "size-full object-cover transition-[filter,transform] duration-[600ms] ease-out",
              blurred ? "scale-105 blur-xl" : "scale-100 blur-0"
            )}
          />
          {revealed && <ImageCaption credit={q.imageCredit} />}
        </div>
      )}
      <p className="text-[19px] leading-snug text-foreground">{q.statement}</p>
      <div
        ref={answersRef}
        className="relative"
        role="group"
        aria-label="Answers"
        {...handlers}
      >
        {!revealed && activeIndex !== null && itemRects[activeIndex] && (
          <HoverGlideBg rect={itemRects[activeIndex]} />
        )}
        {([true, false] as const).map((value, i) => {
          const state = !revealed
            ? "idle"
            : value === q.answer
              ? "correct"
              : value === selected
                ? "wrong"
                : "dimmed";
          return (
            // Same vertical stack + collapse treatment as the choice card.
            <div
              key={String(value)}
              ref={(el) => registerItem(i, el)}
              aria-hidden={state === "dimmed"}
              className={cn(
                "grid [transition:opacity_100ms_ease-out,grid-template-rows_220ms_cubic-bezier(0.77,0,0.175,1)_60ms,margin_220ms_cubic-bezier(0.77,0,0.175,1)_60ms]",
                state === "dimmed"
                  ? "mb-0 grid-rows-[0fr] opacity-0"
                  : "mb-1.5 grid-rows-[1fr] opacity-100 last:mb-0"
              )}
            >
              <div className="min-h-0 overflow-y-clip">
                <button
                  type="button"
                  disabled={revealed}
                  className={answerRowClass(state, activeIndex === i)}
                  onClick={() => {
                    setSelected(value);
                    onResolve(value === q.answer);
                  }}
                >
                  <span>{value ? "True" : "False"}</span>
                  {state === "correct" && <DrawnCheck />}
                  {state === "wrong" && (
                    <span className="-my-1 flex size-6 items-center justify-center">
                      <XIcon size={20} strokeWidth={1.5} />
                    </span>
                  )}
                  {state === "idle" && showKeyHints && <KeyHint n={i + 1} />}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OrderCard({
  rq,
  revealed,
  onResolve,
  keyRef,
  showKeyHints,
  onReadyChange,
  confirmRef,
}: CardProps & {
  rq: RunQuestion;
  /** Reports whether all chips are sequenced, so the bottom bar can show
   *  its Confirm button. */
  onReadyChange: (ready: boolean) => void;
  /** The bottom bar triggers confirmation through this ref. */
  confirmRef: MutableRefObject<(() => void) | null>;
}) {
  const q = rq.q as OrderQuestion;
  const items = rq.items!;
  const answersRef = useRef<HTMLDivElement>(null);
  const { activeIndex, itemRects, handlers, registerItem } =
    useProximityHover(answersRef);
  // Player's picks as indexes into `items`, in tap order.
  const [picks, setPicks] = useState<number[]>([]);
  const correctOrder = useMemo(
    () => [...items].sort((a, b) => a.value - b.value),
    [items]
  );

  const toggle = (i: number) => {
    setPicks((prev) =>
      prev.includes(i) ? prev.filter((p) => p !== i) : [...prev, i]
    );
  };

  useEffect(() => {
    onReadyChange(picks.length === items.length);
  }, [picks.length, items.length, onReadyChange]);

  useEffect(() => {
    confirmRef.current = () => {
      const correct = picks.every((p, seq) => items[p] === correctOrder[seq]);
      onResolve(correct);
    };
    keyRef.current = (n) => {
      if (revealed || n > items.length) return;
      toggle(n - 1);
    };
    return () => {
      confirmRef.current = null;
      keyRef.current = null;
    };
  });

  return (
    <div className="space-y-4">
      <p className="text-[19px] leading-snug text-foreground">{q.prompt}</p>
      <div
        ref={answersRef}
        className="relative"
        role="group"
        aria-label="Items to order"
        {...handlers}
      >
        {!revealed && activeIndex !== null && itemRects[activeIndex] && (
          <HoverGlideBg rect={itemRects[activeIndex]} />
        )}
        {items.map((item, i) => {
          const seq = picks.indexOf(i);
          const correctSeq = correctOrder.indexOf(item);
          const rightPlace = revealed && seq === correctSeq;
          const state = !revealed
            ? "idle"
            : rightPlace
              ? "correct"
              : "wrong";
          return (
            <button
              key={item.label}
              ref={(el) => registerItem(i, el)}
              type="button"
              disabled={revealed}
              className={cn(
                answerRowClass(state, activeIndex === i),
                "mb-1.5 last:mb-0"
              )}
              onClick={() => toggle(i)}
            >
              <span className="flex items-center gap-3">
                <span
                  className={cn(
                    "relative flex size-6 items-center justify-center rounded-full border text-[12px] tabular-nums",
                    !revealed && seq < 0 && "border-border text-muted-foreground",
                    !revealed && seq >= 0 && "border-transparent",
                    revealed && "border-current"
                  )}
                >
                  {!revealed && seq >= 0 && (
                    <>
                      {/* Fill grows in from 0.8; the number arrives a hair
                          smaller, unblurring from 8px. */}
                      <motion.span
                        aria-hidden
                        className="absolute inset-0 rounded-full bg-foreground"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{
                          type: "spring",
                          duration: spring.moderate.duration,
                          bounce: 0,
                        }}
                      />
                      <motion.span
                        key={seq}
                        className="relative text-background"
                        initial={{
                          opacity: 0,
                          scale: 0.95,
                          filter: "blur(8px)",
                        }}
                        animate={{
                          opacity: 1,
                          scale: 1,
                          filter: "blur(0px)",
                        }}
                        transition={{
                          duration: spring.moderate.duration,
                          ease: "easeOut",
                        }}
                      >
                        {seq + 1}
                      </motion.span>
                    </>
                  )}
                  {revealed && correctSeq + 1}
                </span>
                <span>{item.label}</span>
              </span>
              {revealed && (
                <span className="text-[12px] tabular-nums opacity-80">
                  {item.value}
                </span>
              )}
              {!revealed && showKeyHints && <KeyHint n={i + 1} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The deck itself, as a loose fan of its first illustrated cards. Each
 *  card springs up in turn on mount — the deck coming out of its wrapper.
 *  Not rendered for a deck without pictures: empty frames promise what the
 *  deck doesn't have. */
function DeckStack({ images }: { images: string[] }) {
  const reduceMotion = useReducedMotion() ?? false;
  if (!images.length) return null;
  return (
    <span className="relative mb-8 flex h-28 items-center justify-center" aria-hidden>
      {images.map((src, idx) => (
        <motion.span
          key={idx}
          className={cn(
            // Ring in the panel surface so the overlaps read as stacked prints.
            "relative block h-24 w-32 overflow-hidden rounded-[12px] border border-border bg-surface-5 ring-2 ring-surface-4",
            idx > 0 && "-ml-16",
            ["-rotate-6", "rotate-3", "-rotate-2"][idx]
          )}
          initial={
            reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.9 }
          }
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          transition={{ ...cardSpring, delay: 0.06 * idx }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" loading="lazy" className="size-full object-cover" />
        </motion.span>
      ))}
    </span>
  );
}

// ── The modal ───────────────────────────────────────────────

type View = "intro" | "run" | "result";

interface QuizModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The deck to play. Remount (key by slug) when it changes. */
  deck: Deck;
  /** Link shared scores to the prerendered /s/[level]/[score] pages. Only
   *  the built-in deck has them; other decks share the site root. */
  shareLinks?: boolean;
}

export function QuizModal({
  open,
  onOpenChange,
  deck,
  shareLinks = false,
}: QuizModalProps) {
  // The deck drives everything below: levels, pass mark, countdown length.
  const QUIZ_LEVELS = deck.levels;
  const PASS_SCORE = deck.passScore;
  const TIMER_SECONDS = deck.timerSeconds;
  const STORAGE_KEY = `${deck.slug}-quiz-v1`;

  const XIcon = useIcon("x");
  const reduceMotion = useReducedMotion() ?? false;

  const [view, setView] = useState<View>("intro");
  const [levelIndex, setLevelIndex] = useState(0);
  const [run, setRun] = useState<RunQuestion[] | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [score, setScore] = useState(0);
  // Per-question outcome, indexed by question — drives the dot colors.
  const [results, setResults] = useState<boolean[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  // Timed levels open on a briefing slide; the clock only runs after Start.
  const [showTimedIntro, setShowTimedIntro] = useState(false);
  // Whether the run that just ended unlocked the next set of cards.
  const [justUnlocked, setJustUnlocked] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [best, setBest] = useState<BestScores>({});
  // Guards resolve/timeout against double-firing (and against Strict Mode
  // double-invoking state updaters) so a card can never score twice.
  const revealedRef = useRef(false);
  // Ordering cards confirm through the sticky bottom bar: the card reports
  // readiness and hands its confirm action up through this ref.
  const [orderReady, setOrderReady] = useState(false);
  const orderConfirmRef = useRef<(() => void) | null>(null);
  // Number-key answering (desktop): the active card plugs its handler in
  // here; hints are hidden on touch-primary devices.
  const keyActionRef = useRef<((n: number) => void) | null>(null);
  const touchPrimary = useTouchPrimary();

  const level = QUIZ_LEVELS[levelIndex];

  // Fresh state every time the modal opens; read progress then too, so a
  // second tab's scores are picked up.
  useEffect(() => {
    if (!open) return;
    setView("intro");
    setRun(null);
    setConfirmExit(false);
    setBest(loadBest(STORAGE_KEY));
  }, [open, STORAGE_KEY]);

  const unlocked = (i: number) =>
    i === 0 || (best[QUIZ_LEVELS[i - 1].id] ?? 0) >= PASS_SCORE;

  // Hidden levels stay a secret until the one before them is passed: they
  // lend the intro neither their pictures nor their card count.
  const visibleLevels = QUIZ_LEVELS.filter((lv, i) => !lv.hidden || unlocked(i));
  const thumbnails = deckThumbnails(visibleLevels);

  const startRun = (i: number) => {
    setLevelIndex(i);
    setRun(buildRun(QUIZ_LEVELS[i].questions));
    setQIndex(0);
    setScore(0);
    setResults([]);
    revealedRef.current = false;
    setRevealed(false);
    setTimedOut(false);
    setOrderReady(false);
    setConfirmExit(false);
    setShowTimedIntro(QUIZ_LEVELS[i].timed);
    setView("run");
  };

  const resolve = useCallback(
    (correct: boolean) => {
      if (revealedRef.current) return;
      revealedRef.current = true;
      setRevealed(true);
      if (correct) setScore((s) => s + 1);
      setResults((prev) => {
        const next = [...prev];
        next[qIndex] = correct;
        return next;
      });
    },
    [qIndex]
  );

  const timeout = useCallback(() => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    setTimedOut(true);
    setRevealed(true);
    setResults((prev) => {
      const next = [...prev];
      next[qIndex] = false;
      return next;
    });
  }, [qIndex]);

  const advance = () => {
    if (!run) return;
    if (qIndex + 1 < run.length) {
      setQIndex((i) => i + 1);
      revealedRef.current = false;
      setRevealed(false);
      setTimedOut(false);
      setOrderReady(false);
      return;
    }
    // Run finished — persist the best score. A pass on a level that wasn't
    // passed before is what unlocks the next set; a replayed pass isn't.
    const prev = best[level.id] ?? -1;
    setJustUnlocked(prev < PASS_SCORE && score >= PASS_SCORE);
    const isNewBest = score > prev;
    const nextBest = isNewBest ? { ...best, [level.id]: score } : best;
    if (isNewBest) {
      setBest(nextBest);
      saveBest(STORAGE_KEY, nextBest);
    }
    setView("result");
  };

  // Desktop keyboard driving: digits answer, Enter (or Cmd+Enter) confirms an
  // ordering or advances after the reveal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (view !== "run" || confirmExit) return;
      if (e.key === "Enter") {
        // A focused button already handles Enter natively — don't double-fire.
        if (e.target instanceof HTMLElement && e.target.closest("button"))
          return;
        if (revealed) advance();
        else if (orderReady) orderConfirmRef.current?.();
        return;
      }
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= 9) keyActionRef.current?.(n);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const requestClose = useCallback(() => {
    if (view === "run") {
      // Nothing at stake on an untouched first card — go straight back to
      // the deck instead of asking.
      if (qIndex === 0 && !revealed) {
        setView("intro");
        return;
      }
      setConfirmExit(true);
      return;
    }
    onOpenChange(false);
  }, [view, qIndex, revealed, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (confirmExit) setConfirmExit(false);
      else requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, confirmExit, requestClose]);

  const passed = score >= PASS_SCORE;
  const nextLevel =
    levelIndex + 1 < QUIZ_LEVELS.length ? QUIZ_LEVELS[levelIndex + 1] : null;

  // The intro shares the proudest stat: the best score on the highest
  // level the player has a score for. -1 until a first run is finished.
  let bestLevelIndex = -1;
  for (let i = QUIZ_LEVELS.length - 1; i >= 0; i--) {
    if (best[QUIZ_LEVELS[i].id] !== undefined) {
      bestLevelIndex = i;
      break;
    }
  }

  // The levels play in sequence with no list to pick from: Start resumes at
  // the first set of cards the player hasn't passed yet (or from the top once
  // everything is passed).
  const startIndex = Math.max(
    0,
    QUIZ_LEVELS.findIndex((lv) => (best[lv.id] ?? 0) < PASS_SCORE)
  );
  const cardCount = visibleLevels.reduce((n, lv) => n + lv.questions.length, 0);

  // Opens X's composer pre-filled with the score-as-a-challenge line. The
  // link targets the score's share page (/s/[level]/[score]) so the post
  // unfurls with its per-score OG card; built on the live origin, so it stays
  // correct across deploys.
  //
  // On touch devices the https intent link is a trap: the X app claims it as
  // a universal link but renders it in its in-app webview instead of the
  // native composer. The app's own twitter:// scheme does open the native
  // sheet, so mobile tries that first and falls back to the web intent only
  // if nothing takes over the page (app not installed).
  const shareScore = () => {
    const lv = QUIZ_LEVELS[bestLevelIndex];
    const text = shareTextFor(deck, lv, best[lv.id]!);
    const pageUrl = shareLinks
      ? `${window.location.origin}/s/${lv.id}/${best[lv.id]}`
      : `${window.location.origin}/`;
    const webIntent = new URL("https://x.com/intent/post");
    webIntent.searchParams.set("text", text);
    webIntent.searchParams.set("url", pageUrl);

    if (!touchPrimary) {
      window.open(webIntent.toString(), "_blank", "noopener,noreferrer");
      return;
    }

    // The scheme has no separate url param — the link rides in the message.
    const appIntent = `twitter://post?message=${encodeURIComponent(
      `${text} ${pageUrl}`
    )}`;
    const fallback = window.setTimeout(() => {
      // Still visible after a beat = the scheme went nowhere. Same-tab
      // navigation, because a popup this long after the tap gets blocked.
      if (document.visibilityState === "visible")
        window.location.href = webIntent.toString();
    }, 1500);
    // App did take over (page hidden or frozen) — cancel the fallback so it
    // can't fire under the composer or when the player returns.
    window.addEventListener(
      "visibilitychange",
      () => {
        if (document.visibilityState === "hidden") clearTimeout(fallback);
      },
      { once: true }
    );
    window.addEventListener("pagehide", () => clearTimeout(fallback), {
      once: true,
    });
    window.location.href = appIntent;
  };

  const current = run?.[qIndex];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="quiz-backdrop"
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[8px] dark:bg-black/80"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.18 } }}
          transition={{ duration: 0.25 }}
          onClick={requestClose}
        />
      )}
      {open && (
        <motion.div
          key="quiz-panel"
          role="dialog"
          aria-modal="true"
          aria-label={deck.headline}
          style={{ borderRadius: 20 }}
          // One steady footprint for every view, sized to fit an image card
          // (image + three-line question + four answers + footer) without
          // scrolling.
          className={cn(
            "fixed inset-0 z-50 m-auto max-h-[92vh] w-[min(480px,92vw)] overflow-y-auto",
            "h-[min(700px,92vh)]",
            surfaceClasses(4)
          )}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
          exit={
            reduceMotion
              ? { opacity: 0, transition: { duration: 0.12 } }
              : {
                  opacity: 0,
                  scale: 0.98,
                  transition: { duration: spring.slow.exit.duration },
                }
          }
          transition={spring.slow}
        >
          <div className="flex min-h-full flex-col p-6">
            {/* Header. The run view goes headerless — closing happens via the
                Exit button in the bottom bar, and the countdown lives there
                too. */}
            {view !== "run" && (
              <div className="flex items-center justify-end gap-3 pt-1">
                {/* Only the close control up top: the intro and result views
                    carry their own centered titles. */}
                <Button variant="ghost" size="icon-sm" onClick={requestClose}>
                  <XIcon />
                  <span className="sr-only">Close</span>
                </Button>
              </div>
            )}

            {/* Body. The headerless run view fills the fixed-height panel and
                centers short text cards vertically; image cards stay
                top-aligned so the picture never dips below the fold. */}
            <div
              className={cn(
                view === "run" &&
                  cn(
                    "flex flex-1 flex-col",
                    !showTimedIntro &&
                      current &&
                      current.q.kind !== "order" &&
                      ((current.q as ChoiceQuestion).image ||
                        (current.q as ChoiceQuestion).revealImage)
                      ? "justify-start"
                      : "justify-center"
                  ),
                view === "result" && "mt-5 flex flex-1 flex-col",
                view === "intro" && "flex flex-1 flex-col"
              )}
            >
              {view === "intro" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: 1,
                    transition: { duration: spring.moderate.duration },
                  }}
                  className="flex flex-1 flex-col items-center text-center"
                >
                  {/* The unlock moment centers in the space above the pinned
                      CTA: the deck springs up as a fan of cards while a burst
                      of confetti settles around it. */}
                  <div className="relative flex flex-1 flex-col items-center justify-center">
                    <Confetti />
                    <DeckStack images={thumbnails} />
                    <p className="flex items-center gap-1 text-[13px] text-muted-foreground">
                      <DrawnCheck size={16} />
                      Deck unlocked
                    </p>
                    <h2 className="mt-2 max-w-[20ch] font-heading text-[28px] leading-[1.1] text-foreground">
                      {deck.headline}
                    </h2>
                    <p className="mt-3 max-w-[32ch] text-[15px] leading-relaxed text-muted-foreground">
                      {cardCount} cards, ready when you are.{" "}
                      {QUIZ_LEVELS[startIndex].tagline}
                    </p>
                    {bestLevelIndex >= 0 && (
                      <p className="mt-2 text-[13px] tabular-nums text-muted-foreground">
                        Best score: {best[QUIZ_LEVELS[bestLevelIndex].id]}/
                        {QUIZ_LEVELS[bestLevelIndex].questions.length}
                      </p>
                    )}
                  </div>

                  {/* Start pins to the bottom; share waits for a first score. */}
                  <div className="w-full space-y-2">
                    <Button
                      variant="primary"
                      size="lg"
                      className="w-full rounded-full"
                      onClick={() => startRun(startIndex)}
                      autoFocus
                    >
                      {bestLevelIndex < 0
                        ? "Start"
                        : startIndex > 0
                          ? "Keep going"
                          : "Play again"}
                    </Button>
                    {bestLevelIndex >= 0 && (
                      <Button
                        variant="secondary"
                        size="lg"
                        className="w-full rounded-full"
                        leadingIcon={XLogo}
                        onClick={shareScore}
                      >
                        Share your score
                      </Button>
                    )}
                  </div>
                  {deck.author && (
                    <p className="pt-3 text-center text-[13px] text-muted-foreground">
                      Created by{" "}
                      {deck.author.url ? (
                        <a
                          href={deck.author.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="transition-colors duration-80 hover:text-foreground"
                        >
                          {deck.author.name}
                        </a>
                      ) : (
                        deck.author.name
                      )}
                    </p>
                  )}
                </motion.div>
              )}

              {view === "run" && current && showTimedIntro && (
                <TimedIntro seconds={level.timerSeconds ?? TIMER_SECONDS} />
              )}

              {view === "run" && current && !showTimedIntro && (
                <div>
                    <motion.div
                      key={current.q.id}
                      initial={reduceMotion ? { opacity: 0 } : cardEnter}
                      animate={reduceMotion ? { opacity: 1 } : cardCenter}
                      transition={cardSpring}
                      className="min-h-[220px]"
                    >
                      {current.q.kind === "choice" && (
                        <ChoiceCard
                          key={current.q.id}
                          rq={current}
                          revealed={revealed}
                          onResolve={resolve}
                          keyRef={keyActionRef}
                          showKeyHints={!touchPrimary}
                        />
                      )}
                      {current.q.kind === "truefalse" && (
                        <TrueFalseCard
                          key={current.q.id}
                          rq={current}
                          revealed={revealed}
                          onResolve={resolve}
                          keyRef={keyActionRef}
                          showKeyHints={!touchPrimary}
                        />
                      )}
                      {current.q.kind === "order" && (
                        <OrderCard
                          key={current.q.id}
                          rq={current}
                          revealed={revealed}
                          onResolve={resolve}
                          keyRef={keyActionRef}
                          showKeyHints={!touchPrimary}
                          onReadyChange={setOrderReady}
                          confirmRef={orderConfirmRef}
                        />
                      )}

                      {/* Reveal: the one-line fact behind the answer. The
                          advance CTA lives in the bottom bar with the dots.
                          Order cards render it invisibly up front — nothing
                          collapses there, so reserving the space keeps the
                          centered card from shifting on reveal. */}
                      {(revealed || current.q.kind === "order") && (
                        <motion.div
                          initial={false}
                          animate={{
                            opacity: revealed ? 1 : 0,
                            y: revealed ? 0 : 8,
                            transition: {
                              duration: spring.moderate.duration,
                              delay:
                                revealed && current.q.kind !== "order"
                                  ? 0.28
                                  : 0.1,
                              ease: "easeOut",
                            },
                          }}
                          aria-hidden={!revealed}
                          className="mt-4"
                        >
                          {/* px-4 matches the answer rows' inner padding so
                              the fact text aligns with their labels. */}
                          <p className="px-4 text-[15px] leading-relaxed text-muted-foreground">
                            {timedOut && (
                              <span className="text-destructive">
                                Time&#39;s up.{" "}
                              </span>
                            )}
                            {current.q.fact}
                          </p>
                        </motion.div>
                      )}
                    </motion.div>
                </div>
              )}

              {view === "result" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: 1,
                    transition: { duration: spring.moderate.duration },
                  }}
                  className="flex flex-1 flex-col items-center text-center"
                >
                  {/* Score block centers in the space above the pinned CTAs.
                      A pass earns the same confetti as the unlock. */}
                  <div className="relative flex flex-1 flex-col items-center justify-center">
                    {passed && <Confetti />}
                    {passed && (
                      <h2 className="mb-8 font-heading text-[28px] leading-none text-foreground">
                        Congratulations!
                      </h2>
                    )}
                    <p className="font-heading text-[56px] leading-none text-foreground">
                      {score}
                      <span className="text-[28px] text-muted-foreground">
                        /{run?.length}
                      </span>
                    </p>
                    <p className="mt-3 max-w-[30ch] text-[14px] leading-relaxed text-muted-foreground">
                      {verdictFor(deck, score, run?.length ?? 0)}
                    </p>
                    {passed && nextLevel && justUnlocked && (
                      <p className="mt-4 flex items-center gap-1 text-[13px] text-muted-foreground">
                        <DrawnCheck size={16} />
                        {nextLevel.questions.length} more cards unlocked
                      </p>
                    )}
                  </div>
                  <div className="w-full space-y-2">
                    {passed && nextLevel && unlocked(levelIndex + 1) ? (
                      <Button
                        variant="primary"
                        size="lg"
                        className="w-full rounded-full"
                        onClick={() => startRun(levelIndex + 1)}
                        autoFocus
                      >
                        Keep going
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="lg"
                        className="w-full rounded-full"
                        onClick={() => startRun(levelIndex)}
                        autoFocus
                      >
                        Try again
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full rounded-full"
                      onClick={() => setView("intro")}
                    >
                      Back to the deck
                    </Button>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Progress dots, centered at the modal's bottom edge. The active
                dot stretches into a pill; width/color transition smoothly as
                the run advances. Sticky so they stay visible while a tall
                card scrolls, fading the content out beneath them. */}
            {view === "run" && run && (
              <div className="sticky bottom-0 z-10 mt-auto -mx-6 -mb-6 flex min-h-[56px] items-center justify-center bg-gradient-to-t from-surface-4 via-surface-4/85 to-transparent px-6 pb-6 pt-4">
                <span
                  className="absolute bottom-6 left-1/2 flex h-9 -translate-x-1/2 items-center gap-1 sm:gap-2"
                  aria-hidden
                >
                  {level.timed && !revealed && !showTimedIntro ? (
                    <TimerRing
                      key={qIndex}
                      active={!confirmExit}
                      seconds={level.timerSeconds ?? TIMER_SECONDS}
                      onTimeout={timeout}
                    />
                  ) : (
                  run.map((_, i) => {
                    // Answered dots carry their outcome; upcoming ones are
                    // hollow outlines; the current one is the neutral pill
                    // until its reveal colors it.
                    const outcome = results[i];
                    const answered =
                      outcome !== undefined && (i < qIndex || revealed);
                    return (
                      <span
                        key={i}
                        className={cn(
                          "h-1.5 rounded-full transition-all duration-[160ms]",
                          i === qIndex ? "w-1.5 sm:w-5" : "w-1.5",
                          answered
                            ? outcome
                              ? "bg-foreground"
                              : "bg-destructive"
                            : "border border-foreground/30 bg-transparent"
                        )}
                      />
                    );
                  })
                  )}
                </span>
                <span className="sr-only">
                  Question {qIndex + 1} of {run.length}
                </span>
                <div className="absolute bottom-6 left-6">
                  <Button
                    variant="ghost"
                    size="lg"
                    className="rounded-full"
                    onClick={requestClose}
                  >
                    Exit
                  </Button>
                </div>
                <div className="absolute bottom-6 right-6 flex items-center gap-2.5">
                  {showTimedIntro && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, filter: "blur(8px)" }}
                      animate={{
                        opacity: 1,
                        scale: 1,
                        filter: "blur(0px)",
                        transition: {
                          duration: spring.moderate.duration,
                          ease: "easeOut",
                        },
                      }}
                    >
                      <Button
                        variant="primary"
                        size="lg"
                        className="rounded-full"
                        onClick={() => setShowTimedIntro(false)}
                        autoFocus
                      >
                        Start
                      </Button>
                    </motion.div>
                  )}
                  <AnimatePresence>
                  {(revealed ||
                    (current?.q.kind === "order" && orderReady)) && (
                    <motion.div
                      key="footer-cta"
                      // Same entrance/exit language as the order badges: a
                      // touch of scale plus an 8px blur in both directions.
                      initial={{ opacity: 0, scale: 0.95, filter: "blur(8px)" }}
                      animate={{
                        opacity: 1,
                        scale: 1,
                        filter: "blur(0px)",
                        transition: {
                          duration: spring.moderate.duration,
                          // The reveal CTA waits for the collapse; the order
                          // Confirm pops right after the last tap.
                          delay: revealed ? 0.28 : 0,
                          ease: "easeOut",
                        },
                      }}
                      exit={{
                        opacity: 0,
                        scale: 0.95,
                        filter: "blur(8px)",
                        transition: {
                          duration: spring.moderate.exit.duration,
                          ease: "easeIn",
                        },
                      }}
                    >
                      <Button
                        variant="primary"
                        size="lg"
                        className="rounded-full"
                        onClick={
                          revealed
                            ? advance
                            : () => orderConfirmRef.current?.()
                        }
                        autoFocus={revealed}
                      >
                        {!revealed
                          ? "Confirm"
                          : qIndex + 1 < run.length
                            ? "Next"
                            : "Finish"}
                      </Button>
                    </motion.div>
                  )}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </div>

          {/* Mid-run exit confirmation */}
          <AnimatePresence>
            {confirmExit && (
              <motion.div
                key="confirm"
                // Fixed, not absolute: the panel is a scroll container, so an
                // absolute overlay would only cover the top screenful.
                className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-6 backdrop-blur-[8px] dark:bg-black/50"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={{ duration: 0.16 }}
                role="alertdialog"
                aria-label="Leave the quiz?"
              >
                <motion.div
                  className={cn(
                    "w-[min(360px,92vw)] rounded-[16px] p-5",
                    surfaceClasses(5)
                  )}
                  initial={reduceMotion ? {} : { scale: 0.96 }}
                  animate={{ scale: 1 }}
                  exit={reduceMotion ? {} : { scale: 0.98 }}
                  transition={spring.moderate}
                >
                  <p className="font-heading text-[22px] leading-none text-foreground">
                    Leave the quiz?
                  </p>
                  <p className="mt-2 text-[15px] text-muted-foreground">
                    Your progress in this run will be lost.
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="rounded-full"
                      onClick={() => setConfirmExit(false)}
                      autoFocus
                    >
                      Keep playing
                    </Button>
                    <Button
                      variant="primary"
                      size="lg"
                      className="rounded-full"
                      onClick={() => onOpenChange(false)}
                    >
                      Leave
                    </Button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
