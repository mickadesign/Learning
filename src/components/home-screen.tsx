"use client";

import { useState, type CSSProperties } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { BorderBeam } from "border-beam";
import { DECK } from "@/data";
import { REPO_URL } from "@/lib/site";
import { Button } from "@/components/ui/button";
import { QuizModal } from "@/components/quiz/quiz-modal";
import { ThemeToggle } from "@/components/theme-toggle";

// A taste of the deck: up to four illustrated cards that spring out from
// behind the button on hover. Positions are relative to the button row; the
// hidden state tucks each one back toward the button's centre so they read
// as emerging from behind it. Rotations stay in the 2-5deg range.
const PEEK_SLOTS = [
  { className: "-left-28 -top-14 w-36", rotate: -4, hidden: { x: 120, y: 50 } },
  { className: "-left-10 top-5 w-36", rotate: 3, hidden: { x: 90, y: -30 } },
  { className: "-right-28 -top-16 w-36", rotate: 4, hidden: { x: -130, y: 60 } },
  { className: "-right-16 top-3 w-36", rotate: -3, hidden: { x: -90, y: -20 } },
];

const PEEK_IMAGES = DECK.levels
  .flatMap((lv) => lv.questions)
  .flatMap((q) => (q.kind === "choice" && q.image ? [q.image] : []))
  .slice(0, PEEK_SLOTS.length);

/** Faint decorative gridlines under the fold. */
function BackdropGrid() {
  const lines = Array.from({ length: 9 });
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 top-1/2 overflow-hidden">
      {lines.map((_, i) => (
        <span
          key={i}
          className="absolute top-0 bottom-0 border-l border-dashed border-border/60"
          style={{ left: `${(i / lines.length) * 100}%` }}
        />
      ))}
    </div>
  );
}

function levelSummary() {
  const visible = DECK.levels.filter((lv) => !lv.hidden);
  const counts = new Set(visible.map((lv) => lv.questions.length));
  const levels = `${visible.length} ${visible.length === 1 ? "level" : "levels"}`;
  if (counts.size === 1) {
    const n = visible[0].questions.length;
    return `${levels} · ${n} ${n === 1 ? "card" : "cards"} each`;
  }
  return levels;
}

/** The landing: the deck's headline and intro, then the button that opens
 *  the quiz. Everything on screen comes from src/data/deck.json. */
export function HomeScreen() {
  const [quizOpen, setQuizOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const reduceMotion = useReducedMotion();
  const showPeek = hovered && !reduceMotion;

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-surface-1 px-6">
      <BackdropGrid />

      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-[440px] py-24"
      >
        <p className="text-[15px] text-muted-foreground">{DECK.title}</p>
        <h1 className="mt-3 font-heading text-[52px] leading-none text-foreground">
          {DECK.headline}
        </h1>

        {DECK.intro.length > 0 && (
          <div className="mt-8 space-y-5 text-[16px] leading-snug text-muted-foreground">
            {DECK.intro.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        )}

        <motion.div
          className="relative mt-10"
          onHoverStart={() => setHovered(true)}
          onHoverEnd={() => setHovered(false)}
        >
          {PEEK_IMAGES.map((src, i) => {
            const slot = PEEK_SLOTS[i];
            return (
              <motion.img
                key={src}
                src={src}
                alt=""
                aria-hidden
                draggable={false}
                className={`pointer-events-none absolute aspect-[3/2] rounded-2xl object-cover shadow-lg ${slot.className}`}
                initial={false}
                animate={
                  showPeek
                    ? {
                        opacity: 1,
                        scale: 1,
                        x: 0,
                        y: 0,
                        rotate: slot.rotate,
                        transition: {
                          type: "spring",
                          duration: 0.35,
                          bounce: 0.2,
                          delay: i * 0.04,
                        },
                      }
                    : {
                        opacity: 0,
                        scale: 0.35,
                        x: slot.hidden.x,
                        y: slot.hidden.y,
                        rotate: slot.rotate,
                        transition: { type: "spring", duration: 0.2, bounce: 0 },
                      }
                }
              />
            );
          })}

          {/* The golden beam from the level cards, radius matched to the
              pill (h-11). The beam sets its own inline position, so a plain
              div carries the layout. */}
          <div className="relative z-10">
            <BorderBeam
              colorVariant="sunset"
              duration={3.12}
              brightness={1.4}
              hueRange={24}
              borderRadius={22}
              style={
                {
                  "--beam-hue-base": "40deg",
                  "--beam-inner-opacity": "0.15",
                } as CSSProperties
              }
            >
              <Button
                variant="primary"
                size="lg"
                onClick={() => setQuizOpen(true)}
                // Solid bg on the root keeps the pill fully opaque even while
                // the inner hover layer drops to bg-foreground/90 — no images
                // bleeding through.
                className="h-11 w-full rounded-full bg-foreground text-[15px]"
              >
                {DECK.cta}
              </Button>
            </BorderBeam>
          </div>
        </motion.div>

        <p className="mt-4 text-center text-[13px] text-muted-foreground">
          {levelSummary()}
        </p>
      </motion.main>

      <footer className="absolute bottom-6 left-6 z-10 flex items-center gap-1.5 text-[13px] text-muted-foreground">
        {DECK.author && (
          <>
            {DECK.author.url ? (
              <a
                href={DECK.author.url}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors duration-80 hover:text-foreground"
              >
                {DECK.author.name}
              </a>
            ) : (
              <span>{DECK.author.name}</span>
            )}
            {REPO_URL && <span aria-hidden>·</span>}
          </>
        )}
        {REPO_URL && (
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors duration-80 hover:text-foreground"
          >
            Fork this quiz on GitHub
          </a>
        )}
      </footer>

      <div className="fixed bottom-6 right-6 z-20">
        <ThemeToggle />
      </div>

      <QuizModal open={quizOpen} onOpenChange={setQuizOpen} />
    </div>
  );
}
