"use client";

import {
  createElement,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AnimatePresence,
  LayoutGroup,
  animate as animateValue,
  motion,
  useMotionValue,
  useReducedMotion,
} from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  cardPicture,
  type QuizLevel,
} from "@/lib/deck";
import {
  landingIllustratedCards,
  type IllustratedCard,
} from "@/lib/deck-thumbnails";
import { spring } from "@/lib/springs";
import { surfaceClasses } from "@/lib/surface-classes";
import { cn } from "@/lib/utils";
import { playAnswerSound } from "@/lib/sounds";
import { useIcon } from "@/lib/icon-context";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 *   0ms   cards wait behind the heading plane
 *  80ms   left card rises into its resting angle
 * 160ms   center card rises above the stack and heading plane
 * 240ms   right card completes the fan
 *  hover  each card lifts slightly with a fluid spring
 *  drag   card follows the pointer in its original stack layer
 *  drop   card springs back to x/y 0 with a pronounced bounce
 *  click  artwork expands into its timed example card
 *  close  artwork returns to a stationary thumbnail target
 * ───────────────────────────────────────────────────────── */

const CARD_ENTRY_SPRING = {
  type: "spring" as const,
  duration: spring.slow.duration,
  bounce: spring.slow.bounce,
};

const CARD_MORPH_SPRING = spring.moderate;
const REDUCED_MOTION_TRANSITION = { duration: 0 };

const CARD_FAN = {
  entryOffsetY: 16,
  entryScale: 0.86,
  stagger: spring.fast.duration,
  cards: [
    { x: -38.4, y: 5.6, rotate: -8, scale: 0.94, zIndex: 1 },
    { x: 0, y: -2.4, rotate: 2, scale: 1, zIndex: 11 },
    { x: 38.4, y: 4.8, rotate: 8, scale: 0.94, zIndex: 2 },
  ],
};

const PREVIEW_MOTION = {
  initialScale: 0.97,
};

const HOVER_MOTION = {
  offsetY: -4,
  spring: spring.moderate,
};

const DRAG_SNAP_DURATION = spring.slow.duration * 1.75;

const DRAG_MOTION = {
  clickThreshold: 4,
  snapSpring: {
    ...spring.slow,
    duration: DRAG_SNAP_DURATION,
    bounce: 0.4,
  },
};

function previewOptions(question: IllustratedCard): string[] {
  if (question.kind === "truefalse") return ["True", "False"];
  const [correct, ...others] = question.options;
  return others.length ? [others[0], correct, ...others.slice(1)] : [correct];
}

function previewPrompt(question: IllustratedCard): string {
  return question.kind === "choice" ? question.prompt : question.statement;
}

function correctAnswer(question: IllustratedCard): string {
  return question.kind === "choice"
    ? question.options[0]
    : question.answer
      ? "True"
      : "False";
}

function CloseGlyph() {
  const icon = useIcon("x");
  return createElement(icon, { size: 16, strokeWidth: 1.75 });
}

function DraggableThumbnail({
  children,
  reduceMotion,
}: {
  children: ReactNode;
  reduceMotion: boolean;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const didDrag = useRef(false);
  const snapGeneration = useRef(0);

  const snapBack = () => {
    const generation = ++snapGeneration.current;

    if (reduceMotion) {
      x.set(0);
      y.set(0);
      window.setTimeout(() => {
        if (snapGeneration.current === generation) didDrag.current = false;
      }, 0);
    } else {
      void Promise.all([
        animateValue(x, 0, DRAG_MOTION.snapSpring),
        animateValue(y, 0, DRAG_MOTION.snapSpring),
      ]).then(() => {
        if (snapGeneration.current === generation) didDrag.current = false;
      });
    }
  };

  return (
    <motion.div
      drag
      dragMomentum={false}
      style={{ x, y }}
      className="size-full touch-none"
      onDragStart={() => {
        snapGeneration.current += 1;
        x.stop();
        y.stop();
        didDrag.current = false;
      }}
      onDrag={(_, info) => {
        if (
          Math.hypot(info.offset.x, info.offset.y) >
          DRAG_MOTION.clickThreshold
        ) {
          didDrag.current = true;
        }
      }}
      onDragEnd={snapBack}
      onClickCapture={(event) => {
        if (!didDrag.current) return;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <motion.div
        data-hover-thumbnail
        whileHover={reduceMotion ? undefined : { y: HOVER_MOTION.offsetY }}
        transition={HOVER_MOTION.spring}
        className="size-full"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/** Three illustrated cards that open one timed, score-free example. */
export function LandingCardFan({
  levels,
}: {
  levels: QuizLevel[];
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const cards = landingIllustratedCards(levels);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const activeQuestion = activeIndex === null ? undefined : cards[activeIndex];
  const options = activeQuestion ? previewOptions(activeQuestion) : [];
  const triggerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndexRef = useRef<number | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const previewOpen = activeIndex !== null;

  if (!cards.length) return null;

  const picture = activeQuestion ? cardPicture(activeQuestion) : undefined;
  const answer = activeQuestion ? correctAnswer(activeQuestion) : "";
  const resolved = selected !== null;
  const feedback =
    selected === answer
      ? `Correct. ${activeQuestion?.fact ?? ""}`
      : selected
        ? `Not quite. ${answer} is correct.`
        : "";

  const openPreview = (index: number) => {
    setSelected(null);
    activeIndexRef.current = index;
    setActiveIndex(index);
  };

  const closePreview = () => setActiveIndex(null);

  return (
    <LayoutGroup id="landing-card-preview">
      <div className="relative -ml-8 mb-5 h-20 w-[200px]">
        {cards.map((question, index) => {
          const card = CARD_FAN.cards[index];
          const src = cardPicture(question)!;
          const artwork = question.imageCredit?.title ?? `Artwork ${index + 1}`;
          return (
            <motion.span
              key={question.id}
              className="absolute left-[100px] top-1/2 -ml-[38.5px] -mt-[63px] block h-[86px] w-[77px]"
              style={{ zIndex: card.zIndex }}
              initial={
                reduceMotion
                  ? { opacity: 0 }
                  : {
                      opacity: 0,
                      x: card.x,
                      y: card.y + CARD_FAN.entryOffsetY,
                      rotate: card.rotate * 0.35,
                      scale: CARD_FAN.entryScale,
                    }
              }
              animate={{
                opacity: 1,
                x: card.x,
                y: card.y,
                rotate: card.rotate,
                scale: card.scale,
              }}
              transition={{
                ...CARD_ENTRY_SPRING,
                delay: reduceMotion ? 0 : CARD_FAN.stagger * (index + 1),
              }}
            >
              <DraggableThumbnail reduceMotion={reduceMotion}>
                <motion.button
                  ref={(node) => {
                    triggerRefs.current[index] = node;
                  }}
                  type="button"
                  aria-label={`Open ${artwork} flashcard example`}
                  aria-haspopup="dialog"
                  aria-expanded={activeIndex === index}
                  onClick={() => openPreview(index)}
                  title={`Preview ${artwork}`}
                  layoutId={`landing-card-shell-${question.id}`}
                  className="block size-full cursor-pointer overflow-hidden rounded-lg bg-surface-5 shadow-[0_5px_10px_-5px_rgba(0,0,0,0.35)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus-ring,#6B97FF)]"
                  transition={
                    reduceMotion
                      ? REDUCED_MOTION_TRANSITION
                      : CARD_MORPH_SPRING
                  }
                >
                  <motion.div
                    layoutId={`landing-card-image-${question.id}`}
                    transition={
                      reduceMotion
                        ? REDUCED_MOTION_TRANSITION
                        : CARD_MORPH_SPRING
                    }
                    className="h-[43px] w-full overflow-hidden"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt=""
                      loading="eager"
                      draggable={false}
                      className="size-full object-cover"
                    />
                  </motion.div>
                  <div
                    aria-hidden="true"
                    className="flex h-[43px] flex-col bg-surface-4 px-[6px] py-[5px]"
                  >
                    {/* A question line and two answer pills: the least
                        that still reads as a flashcard at this size. */}
                    <span className="h-[4px] w-3/4 rounded-full bg-foreground/25" />
                    <div className="mt-[6px] flex flex-col gap-[4px]">
                      <span className="h-[6px] w-full rounded-full bg-foreground/10" />
                      <span className="h-[6px] w-full rounded-full bg-foreground/10" />
                    </div>
                  </div>
                </motion.button>
              </DraggableThumbnail>
            </motion.span>
          );
        })}
      </div>

      <Dialog.Root
        open={previewOpen}
        onOpenChange={(open) => {
          if (!open) closePreview();
        }}
      >
        <Dialog.Portal forceMount>
          <AnimatePresence initial={false}>
            {previewOpen && activeQuestion && picture && (
              <>
                <Dialog.Overlay forceMount asChild>
                  <motion.div
                    key="landing-card-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={spring.moderate}
                    className="fixed inset-0 z-50 bg-black/16 backdrop-blur-[8px]"
                  />
                </Dialog.Overlay>

                <motion.div
                  key="landing-card-positioner"
                  className="pointer-events-none fixed inset-0 z-[51] grid place-items-center overflow-y-auto p-4"
                >
                  <Dialog.Content
                    forceMount
                    aria-labelledby={titleId}
                    aria-describedby={descriptionId}
                    onCloseAutoFocus={(event) => {
                      event.preventDefault();
                      const closedIndex = activeIndexRef.current;
                      activeIndexRef.current = null;
                      if (closedIndex !== null) {
                        triggerRefs.current[closedIndex]?.focus();
                      }
                    }}
                    asChild
                  >
                    <motion.div
                      layoutId={`landing-card-shell-${activeQuestion.id}`}
                      transition={
                        reduceMotion
                          ? REDUCED_MOTION_TRANSITION
                          : CARD_MORPH_SPRING
                      }
                      className={cn(
                        "pointer-events-auto max-h-[calc(100dvh-32px)] w-[min(440px,calc(100vw-32px))] overflow-x-hidden overflow-y-auto overscroll-contain rounded-[20px] text-foreground shadow-2xl",
                        surfaceClasses(4)
                      )}
                    >
                      <motion.div
                        layoutId={`landing-card-image-${activeQuestion.id}`}
                        transition={
                          reduceMotion
                            ? REDUCED_MOTION_TRANSITION
                            : CARD_MORPH_SPRING
                        }
                        className="relative h-48 overflow-hidden bg-surface-5"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={picture}
                          alt={activeQuestion.imageCredit?.title ?? "Flashcard artwork"}
                          className="size-full object-cover"
                        />
                        <Dialog.Close asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Close"
                            className="absolute right-3 top-3 rounded-full bg-black/40 text-white shadow-sm backdrop-blur-md hover:text-white"
                          >
                            <CloseGlyph />
                          </Button>
                        </Dialog.Close>
                      </motion.div>

                      <motion.div
                        initial={
                          reduceMotion
                            ? { opacity: 0 }
                            : {
                                opacity: 0,
                                scale: PREVIEW_MOTION.initialScale,
                              }
                        }
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={spring.slow}
                        className="p-5"
                      >
                        <Dialog.Title id={titleId} className="sr-only">
                          {activeQuestion.imageCredit?.title ?? "Artwork"} flashcard
                        </Dialog.Title>
                        <Dialog.Description id={descriptionId} className="sr-only">
                          Pick the answer.
                        </Dialog.Description>

                        <p className="font-heading text-[26px] leading-[1.1]">
                          {previewPrompt(activeQuestion)}
                        </p>

                        <div className="mt-5 space-y-2">
                          {options.map((option) => {
                            const correct = option === answer;
                            const chosen = option === selected;
                            return (
                              <button
                                key={option}
                                type="button"
                                disabled={resolved}
                                onClick={() => {
                                  playAnswerSound(option === answer);
                                  setSelected(option);
                                }}
                                className={cn(
                                  "flex min-h-11 w-full items-center rounded-full border px-4 py-2.5 text-left text-[14px] transition-colors duration-80",
                                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring,#6B97FF)]",
                                  !resolved &&
                                    "cursor-pointer border-border hover:bg-hover active:bg-active",
                                  resolved &&
                                    correct &&
                                    "border-transparent bg-foreground text-background",
                                  resolved &&
                                    chosen &&
                                    !correct &&
                                    "border-destructive/30 bg-destructive/10 text-destructive",
                                  resolved &&
                                    !correct &&
                                    !chosen &&
                                    "border-border text-muted-foreground opacity-50"
                                )}
                              >
                                {option}
                              </button>
                            );
                          })}
                        </div>

                        <p
                          role="status"
                          aria-live="polite"
                          className="mt-4 min-h-5 text-[13px] leading-snug text-muted-foreground"
                        >
                          {feedback}
                        </p>
                      </motion.div>
                    </motion.div>
                  </Dialog.Content>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </Dialog.Portal>
      </Dialog.Root>
    </LayoutGroup>
  );
}
