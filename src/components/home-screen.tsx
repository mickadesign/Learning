"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DECK } from "@/data";
import type { Deck } from "@/lib/deck";
import { buildDeck, GenerationUnavailable, type DeckBuild } from "@/lib/create-deck";
import { bestScoresFor, useSavedDecks } from "@/lib/deck-store";
import { adoptSharedDeck } from "@/lib/adopt-shared-deck";
import { useAgentActivity, useWebMcpTools, type DeckSummary } from "@/lib/webmcp";
import { REPO_URL } from "@/lib/site";
import { spring } from "@/lib/springs";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Confetti } from "@/components/quiz/confetti";
import { WanderingCursor } from "@/components/wandering-cursor";
import { DeckList } from "@/components/deck-list";
import { ShareLinkButton } from "@/components/share-link-button";
import { AgentPromptButton } from "@/components/agent-prompt-button";
import { LandingCardFan } from "@/components/landing-card-fan";
import { PhyllotaxisBackdrop } from "@/components/phyllotaxis-backdrop";
import { QuizModal } from "@/components/quiz/quiz-modal";
import { ThemeToggle } from "@/components/theme-toggle";
import { SoundToggle } from "@/components/sound-toggle";

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

/** An agent that stops calling tools shouldn't leave a spinner behind. */
const AGENT_QUIET_MS = 90_000;

/** The landing: one question, the agent prompt that answers it, the decks
 *  on this page, and the quiz. Every deck — the built-in one and the ones
 *  written here — plays in the same modal. */
interface HomeScreenProps {
  /** A deck opened from its share link (/d/<id>): saved into this browser
   *  next to the visitor's own decks, then opened. */
  shared?: { deck: Deck; id: string };
  /** Rendered at /agent, where the copied agent prompt sends the agent: the
   *  page greets it before its first tool call. */
  agentExpected?: boolean;
}

export function HomeScreen({ shared, agentExpected = false }: HomeScreenProps = {}) {
  const saved = useSavedDecks();
  // Newest first, so a deck just written sits at the top of the list.
  const decks = useMemo(() => [DECK, ...[...saved].reverse()], [saved]);

  const [activeDeck, setActiveDeck] = useState<Deck>(DECK);
  const [quizOpen, setQuizOpen] = useState(false);
  const [build, setBuild] = useState<DeckBuild | null>(null);
  const building = build?.status.phase === "planning" || build?.status.phase === "writing";

  // Whether the open quiz is the deck's first showing, right after it was
  // made here: that open gets the confetti and the "Deck unlocked" line.
  // A deck opened from a link, the list, or later on is simply opened.
  const [fresh, setFresh] = useState(false);
  const openDeck = useCallback((deck: Deck, options?: { fresh?: boolean }) => {
    setActiveDeck(deck);
    setFresh(!!options?.fresh);
    setQuizOpen(true);
  }, []);

  // A shared deck lands in this browser's collection under its own slug —
  // or a fresh one if that slug is taken by a different deck — remembers
  // the link it came from, and opens. Once per page load.
  const sharedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!shared || sharedRef.current === shared.id) return;
    sharedRef.current = shared.id;
    // The store, not `decks`: during hydration the React snapshot of the
    // saved decks is still the server's empty one.
    const deck = adoptSharedDeck(shared, DECK, window.location.origin);
    // Not in the effect's own tick: opening is a state change.
    void Promise.resolve().then(() => openDeck(deck));
  }, [shared, openDeck]);

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
  // tool says so).
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
          openDeck(deck, { fresh: true });
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

  // The agent prompt sends its agent to /agent, so the page can acknowledge
  // the agent as soon as it lands — before its first tool call — and then
  // follow along call by call until the deck is published.
  const activity = useAgentActivity();
  // Quiet detection without resetting state: the timer records which call
  // it timed out on, and a new call (a new `at`) is never equal to it.
  const [quietAt, setQuietAt] = useState<number | null>(null);
  useEffect(() => {
    if (activity.phase !== "working") return;
    const id = setTimeout(() => setQuietAt(activity.at), AGENT_QUIET_MS);
    return () => clearTimeout(id);
  }, [activity]);
  const agentQuiet = activity.phase === "working" && quietAt === activity.at;
  // The same patience for an agent that never shows up: a stale /agent
  // link (a refresh after the session, a link the agent echoed back) falls
  // back to the prompt instead of waiting forever.
  const [expectedGaveUp, setExpectedGaveUp] = useState(false);
  useEffect(() => {
    if (!agentExpected || activity.phase !== "idle") return;
    const id = setTimeout(() => setExpectedGaveUp(true), AGENT_QUIET_MS);
    return () => clearTimeout(id);
  }, [agentExpected, activity.phase]);
  const agentState: "expected" | "working" | "quiet" | "done" | null =
    activity.phase === "working"
      ? agentQuiet
        ? "quiet"
        : "working"
      : activity.phase === "done"
        ? "done"
        : agentExpected && !expectedGaveUp
          ? "expected"
          : null;
  // The headline follows the work: who has just arrived, what is being
  // created while the agent writes, what is ready once it has published.
  const headline =
    agentState === "expected"
      ? "Psst. Your agent is waiting on you."
      : agentState === "working" && activity.phase === "working"
      ? activity.title
        ? `Creating flashcards for ${activity.title}…`
        : "Creating your flashcards…"
      : agentState === "done" && activity.phase === "done"
        ? // With other decks listed, the new one is the last row and names
          // itself; the headline speaks for the shelf instead.
          decks.length > 1
          ? "One more deck on the shelf."
          : `Flashcards for ${activity.deck.title} are ready.`
        : "Hey agent, make your human smarter.";
  // Once published with other decks listed, the new deck is already the
  // list's last row: a status line naming it again would list it twice.
  const readyInList = agentState === "done" && decks.length > 1;

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-surface-1 px-6">
      <PhyllotaxisBackdrop />

      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        // 480px: wide enough for "Creating your flashcards…" on one line.
        // A flex column so the status line can step above the deck list
        // while the agent is expected (`order-last` on the list below).
        className="relative z-10 flex w-full max-w-[480px] flex-col py-24"
      >
        {!build && !agentState && (
          <LandingCardFan
            levels={DECK.levels}
          />
        )}

        {/* The great unlock: the moment an agent starts writing, fireworks
            fill the page. Keyed on the start of this stretch of work, so
            they play once per deck, not once per call. Publishing opens the
            quiz, whose intro brings its own volley — no second one here. */}
        {activity.phase === "working" && agentState === "working" && (
          <Confetti key={activity.since} />
        )}
        {/* The agent's hand: a big cursor drifting over the page from the
            moment it lands until it has published. */}
        <AnimatePresence>
          {(agentState === "expected" || agentState === "working") && (
            <WanderingCursor key="cursor" />
          )}
        </AnimatePresence>
        <AnimatePresence mode="wait" initial={false}>
          <motion.h1
            key={headline}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: spring.moderate.exit.duration } }}
            transition={{ duration: spring.slow.duration, ease: "easeOut" }}
            className={cn(
              "relative z-10 text-balance font-heading text-[52px] leading-none text-foreground",
              // The one-line promise stays on one line where the column is
              // wide enough (480px); on a phone it wraps like any headline.
              headline === "Creating your flashcards…" && "sm:whitespace-nowrap",
              // While the agent writes, the headline itself is the loading
              // signal: a muted band sweeps across it.
              agentState === "working" && "shimmer-heading"
            )}
          >
            {headline}
          </motion.h1>
        </AnimatePresence>

        {/* The decks on this page, once there is a choice to make. They step
            aside while an agent is writing. */}
        <AnimatePresence initial={false}>
          {decks.length > 1 && agentState !== "working" && (
            <motion.div
              key="decks"
              // While the agent is expected the status line reads first and
              // the decks follow it.
              className={cn(agentState === "expected" ? "order-last mt-4" : "mt-8")}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: spring.moderate.duration } }}
              exit={{ opacity: 0, transition: { duration: spring.moderate.exit.duration } }}
            >
              <DeckList decks={decks} builtInSlug={DECK.slug} onPlay={(slug) => playDeck(slug)} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status under the headline: what the generator is doing, or what this
            deployment can do. */}
        <AnimatePresence mode="wait" initial={false}>
          {!readyInList && (
          <motion.div
            key={
              build
                ? `${build.status.phase}-${build.status.phase === "writing" ? build.status.index : ""}`
                : agentState
                  ? `agent-${agentState}-${activity.phase === "working" ? activity.tool : ""}`
                  : "idle"
            }
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: spring.fast.exit.duration } }}
            transition={{ duration: spring.moderate.duration, ease: "easeOut" }}
            className={cn(
              "flex min-h-9 items-center gap-3 text-[14px] leading-snug text-muted-foreground",
              agentState === "expected"
                ? "mt-8"
                : decks.length > 1 && agentState !== "working"
                ? "mt-4"
                : build || agentState
                  ? "mt-8"
                  : "mt-2"
            )}
          >
            {build ? (
              <>
                {building && <Spinner />}
                <span className={cn(build.status.phase === "error" && "text-destructive")}>
                  {statusLine(build)}
                </span>
                {build.deck && !quizOpen && (
                  <Button
                    variant="primary"
                    size="lg"
                    className="ml-auto shrink-0 rounded-full"
                    onClick={() => openDeck(build.deck!)}
                  >
                    Play
                  </Button>
                )}
              </>
            ) : agentState === "expected" ? (
              // The agent has landed and is asking, in its own chat, what
              // the human wants to learn: send them back there.
              <span>Your agent is asking what you want to learn. Answer in the chat.</span>
            ) : agentState === "working" ? (
              // The headline's shimmer and the wandering cursor carry the
              // state; the line stays empty (its height is reserved).
              null
            ) : agentState === "quiet" ? (
              <span>Your agent has gone quiet. Nudge it, or pick a deck.</span>
            ) : agentState === "done" && activity.phase === "done" ? (
              <>
                <span>“{activity.deck.title}” is ready.</span>
                {!quizOpen && (
                  <span className="ml-auto flex shrink-0 items-center gap-1">
                    <ShareLinkButton deck={activity.deck} />
                    <Button
                      variant="primary"
                      size="lg"
                      className="rounded-full"
                      onClick={() => openDeck(activity.deck)}
                    >
                      Play
                    </Button>
                  </span>
                )}
              </>
            ) : (
              // The page is agent-first: hand the job to the visitor's own
              // agent. The prompt sends it here to use the WebMCP tools.
              // mt-2 opens the gap under the headline a touch wider than the
              // status lines get.
              <div className="mt-2 flex flex-col items-start gap-9">
                <span>
                  Ask what your human want to learn, then build beautiful flashcards.
                </span>
                {/* Pulled left by the pill's border, padding and the copy
                    button's own inset, so the copy icon lines up with the
                    text above instead of the pill's edge. */}
                {/* Pulled left by the border and the icon's inset so the
                    label sits flush with the headline. */}
                <AgentPromptButton className="-ml-[17px]" />
              </div>
            )}
          </motion.div>
          )}
        </AnimatePresence>

        {/* The nudge onward, once a deck is done: another deck is one prompt
            away, so the prompt itself is right here to copy. */}
        <AnimatePresence initial={false}>
          {agentState === "done" && (
            <motion.div
              key="nudge"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0, transition: { duration: spring.moderate.duration, ease: "easeOut" } }}
              exit={{ opacity: 0, transition: { duration: spring.fast.exit.duration } }}
              className={cn(
                "flex flex-col items-start gap-4 text-[14px] leading-snug text-muted-foreground",
                readyInList ? "mt-8" : "mt-6"
              )}
            >
              <span>Curious about something else? Ask your agent for another deck.</span>
              {/* Pulled left by the border and the icon's inset so the
                  label sits flush with the text above. */}
              <AgentPromptButton another className="-ml-[17px]" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.main>

      {/* Stacked on phones, where a row would run under the theme toggle;
          one line with separators from the sm breakpoint up. */}
      <footer className="absolute bottom-6 left-6 z-10 flex flex-col items-start gap-1.5 text-[13px] text-muted-foreground sm:flex-row sm:items-center">
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
            {REPO_URL && <span aria-hidden className="hidden sm:inline">·</span>}
          </>
        )}
        {REPO_URL && (
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors duration-80 hover:text-foreground"
          >
            Free &amp; Open Source
          </a>
        )}
        <span aria-hidden className="hidden sm:inline">·</span>
        {/* Agents on this page get tools on document.modelContext; the
            reference for them (and curious humans) is a plain markdown file. */}
        <a href="/agents.md" className="transition-colors duration-80 hover:text-foreground">
          For agents
        </a>
      </footer>

      <div className="fixed bottom-6 right-6 z-20">
        <ThemeToggle />
      </div>

      {/* Above the quiz modal and its backdrop (z-50) and the fireworks
          canvas (z-60, click-through), so sound can be muted mid-quiz. */}
      <div className="fixed right-4 top-4 z-[70] sm:right-6 sm:top-6">
        <SoundToggle />
      </div>

      <QuizModal
        key={activeDeck.slug}
        open={quizOpen}
        onOpenChange={setQuizOpen}
        deck={activeDeck}
        celebrate={fresh}
        // Not while this deck is still being written: a link is forever,
        // and it would point at the levels that had landed so far.
        shareable={
          activeDeck.slug !== DECK.slug && !(building && build?.deck?.slug === activeDeck.slug)
        }
      />
    </div>
  );
}
