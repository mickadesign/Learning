import { parseDeck, type Deck, type QuizQuestion } from "@/lib/deck";

/** The smallest deck the schema accepts, with knobs for what a test needs. */
export function deckFixture(overrides: Partial<Deck> & { questions?: QuizQuestion[] } = {}): Deck {
  const { questions, ...rest } = overrides;
  return parseDeck({
    slug: "test-deck",
    title: "Test deck",
    headline: "Do you know the test deck?",
    tagline: "A deck for the tests.",
    verdicts: { low: "Low.", mid: "Mid.", high: "High.", perfect: "Perfect." },
    passScore: 1,
    levels: [
      {
        id: "one",
        name: "One",
        tagline: "The first level.",
        questions: questions ?? [choice("one-1")],
      },
    ],
    ...rest,
  });
}

export function choice(id: string, extra: Record<string, unknown> = {}) {
  return {
    kind: "choice" as const,
    id,
    prompt: "Capital of France?",
    options: ["Paris", "Lyon", "Nice"],
    fact: "Paris has been the capital since the tenth century.",
    ...extra,
  } as QuizQuestion;
}

export function trueFalse(id: string, extra: Record<string, unknown> = {}) {
  return {
    kind: "truefalse" as const,
    id,
    statement: "The Seine flows through Paris.",
    answer: true,
    fact: "It does, on its way to the Channel.",
    ...extra,
  } as QuizQuestion;
}

export function order(id: string) {
  return {
    kind: "order" as const,
    id,
    prompt: "Oldest first.",
    items: [
      { label: "Roman", value: 1 },
      { label: "Medieval", value: 2 },
      { label: "Modern", value: 3 },
    ],
    fact: "Rome came first.",
  } as QuizQuestion;
}

/** A raw deck object, the way an agent would send it, before parsing. */
export function rawDeck(overrides: Record<string, unknown> = {}) {
  return {
    slug: "raw-deck",
    title: "Raw deck",
    headline: "Raw?",
    tagline: "t",
    verdicts: { low: "a", mid: "b", high: "c", perfect: "d" },
    passScore: 1,
    levels: [{ id: "l", name: "L", tagline: "t", questions: [choice("l-1")] }],
    ...overrides,
  };
}
