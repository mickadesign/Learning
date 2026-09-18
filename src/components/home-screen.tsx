"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DECK } from "@/data";
import type { Deck } from "@/lib/deck";
import { buildDeck, GenerationUnavailable, type DeckBuild } from "@/lib/create-deck";
import { bestScoresFor, useSavedDecks } from "@/lib/deck-store";
import { useWebMcpTools, type DeckSummary } from "@/lib/webmcp";
import { REPO_URL } from "@/lib/site";
import { spring } from "@/lib/springs";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { QuizModal } from "@/components/quiz/quiz-modal";
import { TopicCombobox } from "@/components/topic-combobox";
import { ThemeToggle } from "@/components/theme-toggle";

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

/** The Button's loading glyph, on its own, for the status line. */
function Spinner() {
  return (
    <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M 12 12 C 14 8.5 19 8.5 19 12 C 19 15.5 14 15.5 12 12 C 10 8.5 5 8.5 5 12 C 5 15.5 10 15.5 12 12 Z"
        stroke="currentColor"
        strokeWidth="1.125"
        strokeLinecap="round"
        pathLength="100"
        style={{
          strokeDasharray: "15 85",
          animation: "spinner-move 2s linear infinite, spinner-dash 4s ease-in-out infinite",
        }}
      />
    </svg>
  );
}

function statusLine(build: DeckBuild): string {
  switch (build.status.phase) {
    case "planning":
      return `Planning a deck about “${build.topic}”…`;
    case "writing":
      return `Writing the ${build.status.level.name} level (${build.status.index} of ${build.status.total})…`;
    case "ready":
      return `“${build.deck?.title}” is ready — all ${build.deck?.levels.length} levels.`;
    case "error":
      return build.status.message;
  }
}

/** The landing: one question, a combobox to answer it, and the quiz. Every
 *  deck — the built-in one and the ones written here — plays in the same
 *  modal. */
export function HomeScreen() {
  const saved = useSavedDecks();
  // Newest first, so a deck just written sits at the top of the list.
  const decks = useMemo(() => [DECK, ...[...saved].reverse()], [saved]);

  const [activeDeck, setActiveDeck] = useState<Deck>(DECK);
  const [quizOpen, setQuizOpen] = useState(false);
  const [build, setBuild] = useState<DeckBuild | null>(null);
  // null until /api/decks answers; the combobox waits for it to offer the
  // create row.
  const [canCreate, setCanCreate] = useState<boolean | null>(null);
  const building = build?.status.phase === "planning" || build?.status.phase === "writing";

  useEffect(() => {
    let cancelled = false;
    fetch("/api/decks")
      .then((r) => r.json())
      .then((d: { available: boolean }) => {
        if (!cancelled) setCanCreate(!!d.available);
      })
      .catch(() => {
        if (!cancelled) setCanCreate(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openDeck = useCallback((deck: Deck) => {
    setActiveDeck(deck);
    setQuizOpen(true);
  }, []);

  const playDeck = useCallback(
    (slug?: string): Deck => {
      const deck = slug ? decks.find((d) => d.slug === slug) : DECK;
      if (!deck) throw new Error(`No deck "${slug}". Try list_flashcard_decks.`);
      openDeck(deck);
      return deck;
    },
    [decks, openDeck]
  );

  // One build at a time; a second request while one runs is ignored (the
  // combobox is disabled meanwhile, and the tool says so).
  const buildRef = useRef<Promise<Deck> | null>(null);
  const generateDeck = useCallback(
    (topic: string, notes?: string): Promise<Deck> => {
      if (buildRef.current) throw new Error("A deck is already being written. Wait for it to finish.");
      let playable: ((deck: Deck) => void) | null = null;
      let failed: ((error: unknown) => void) | null = null;
      const firstLevel = new Promise<Deck>((resolve, reject) => {
        playable = resolve;
        failed = reject;
      });
      const run = buildDeck(topic, {
        notes,
        takenSlugs: decks.map((d) => d.slug),
        onUpdate: (b) => {
          setBuild(b);
          // The open modal follows the deck as levels arrive.
          if (b.deck) setActiveDeck((cur) => (cur.slug === b.deck!.slug ? b.deck! : cur));
        },
        onPlayable: (deck) => {
          openDeck(deck);
          playable?.(deck);
        },
      });
      buildRef.current = run;
      run
        .catch((error: unknown) => {
          const message =
            error instanceof GenerationUnavailable
              ? "Deck generation isn't set up on this deployment."
              : error instanceof Error
                ? error.message
                : String(error);
          setBuild({ topic, deck: null, pending: [], status: { phase: "error", message } });
          if (error instanceof GenerationUnavailable) setCanCreate(false);
          failed?.(new Error(message));
        })
        .finally(() => {
          buildRef.current = null;
        });
      return firstLevel;
    },
    [decks, openDeck]
  );

  const listDecks = useCallback(
    (): DeckSummary[] =>
      decks.map((d) => {
        const best = bestScoresFor(d.slug);
        return {
          slug: d.slug,
          title: d.title,
          headline: d.headline,
          builtIn: d.slug === DECK.slug,
          levels: d.levels.map((l) => ({
            id: l.id,
            name: l.name,
            cards: l.questions.length,
            timed: l.timed,
            hidden: l.hidden,
            ...(best[l.id] !== undefined ? { best: best[l.id] } : {}),
          })),
        };
      }),
    [decks]
  );

  const findDeck = useCallback(
    (slug: string) => decks.find((d) => d.slug === slug),
    [decks]
  );

  // The store forgets the deck; the page just makes sure it isn't left open.
  const deleteDeck = useCallback(
    (slug: string) => {
      if (activeDeck.slug === slug) {
        setQuizOpen(false);
        setActiveDeck(DECK);
      }
    },
    [activeDeck.slug]
  );

  useWebMcpTools({ generateDeck, openDeck, playDeck, listDecks, findDeck, deleteDeck });

  const pendingLevels =
    build?.deck && build.deck.slug === activeDeck.slug ? build.pending : [];

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-surface-1 px-6">
      <BackdropGrid />

      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-[440px] py-24"
      >
        <p className="text-[15px] text-muted-foreground">Flashcards</p>
        <h1 className="mt-3 font-heading text-[52px] leading-none text-foreground">
          What topic are you interested in learning?
        </h1>

        {/* The field sits flush with the text column: -mx offsets its own
            horizontal padding so the placeholder aligns with the headline. */}
        <div className="-mx-3 mt-8">
          <TopicCombobox
            decks={decks}
            canCreate={canCreate === true}
            disabled={building}
            onPlay={(slug) => playDeck(slug)}
            onCreate={(topic) => {
              generateDeck(topic).catch(() => {});
            }}
          />
        </div>

        {/* Status under the field: what the generator is doing, or what this
            deployment can do. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={build ? `${build.status.phase}-${build.status.phase === "writing" ? build.status.index : ""}` : `idle-${canCreate}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: spring.fast.exit.duration } }}
            transition={{ duration: spring.moderate.duration, ease: "easeOut" }}
            className="mt-4 flex min-h-[28px] items-center gap-3 text-[14px] leading-snug text-muted-foreground"
          >
            {build ? (
              <>
                {building && <Spinner />}
                <span className={cn(build.status.phase === "error" && "text-destructive")}>
                  {statusLine(build)}
                </span>
                {build.deck && !quizOpen && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="ml-auto shrink-0 rounded-full"
                    onClick={() => openDeck(build.deck!)}
                  >
                    Play
                  </Button>
                )}
              </>
            ) : canCreate === false ? (
              <span>
                Pick a deck to play. Writing new ones needs an{" "}
                <code className="text-[13px]">ANTHROPIC_API_KEY</code> on the server.
              </span>
            ) : (
              <span>
                Pick a deck, or type anything: four levels of ten cards, written
                for you while you play the first.
              </span>
            )}
          </motion.div>
        </AnimatePresence>
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
            Fork this on GitHub
          </a>
        )}
        <span aria-hidden>·</span>
        {/* Agents on this page get tools on document.modelContext; the
            reference for them (and curious humans) is a plain markdown file. */}
        <a href="/agents.md" className="transition-colors duration-80 hover:text-foreground">
          For agents
        </a>
      </footer>

      <div className="fixed bottom-6 right-6 z-20">
        <ThemeToggle />
      </div>

      <QuizModal
        key={activeDeck.slug}
        open={quizOpen}
        onOpenChange={setQuizOpen}
        deck={activeDeck}
        pendingLevels={pendingLevels}
        shareLinks={activeDeck.slug === DECK.slug}
      />
    </div>
  );
}
