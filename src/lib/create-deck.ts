// The browser side of deck generation: plan, then one level at a time,
// saving after each so the deck is playable (and persisted) as soon as its
// first level lands, while the rest keep arriving.

import {
  assembleDeck,
  type Deck,
  type DeckPlan,
  type LevelBrief,
  type QuizQuestion,
} from "./deck";
import { saveDeck } from "./deck-store";

export type BuildStatus =
  | { phase: "planning" }
  | { phase: "writing"; level: LevelBrief; index: number; total: number }
  | { phase: "ready" }
  | { phase: "error"; message: string };

export interface DeckBuild {
  topic: string;
  /** Null until the first level is written. */
  deck: Deck | null;
  /** Levels still to come, in order. */
  pending: LevelBrief[];
  status: BuildStatus;
}

export class GenerationUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationUnavailable";
  }
}

async function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (res.status === 503) throw new GenerationUnavailable(data.error ?? "Unavailable");
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export interface BuildOptions {
  notes?: string;
  signal?: AbortSignal;
  /** Every change: status, a new level, an error. */
  onUpdate?: (build: DeckBuild) => void;
  /** Once, when the first level exists. */
  onPlayable?: (deck: Deck) => void;
  /** Slugs already in use (built-in + saved), to keep the new one unique. */
  takenSlugs?: Iterable<string>;
}

export async function buildDeck(
  topic: string,
  { notes, signal, onUpdate, onPlayable, takenSlugs = [] }: BuildOptions = {}
): Promise<Deck> {
  const build: DeckBuild = { topic, deck: null, pending: [], status: { phase: "planning" } };
  const emit = () => onUpdate?.({ ...build, pending: [...build.pending] });
  emit();

  const { plan } = await post<{ plan: DeckPlan }>("/api/decks/plan", { topic, notes }, signal);
  const taken = new Set(takenSlugs);
  let slug = plan.slug;
  for (let i = 2; taken.has(slug); i++) slug = `${plan.slug}-${i}`;

  build.pending = [...plan.levels];
  const cards: Record<string, QuizQuestion[]> = {};
  const avoid: string[] = [];

  for (let i = 0; i < plan.levels.length; i++) {
    const level = plan.levels[i];
    build.status = { phase: "writing", level, index: i + 1, total: plan.levels.length };
    emit();
    try {
      const { questions } = await post<{ questions: QuizQuestion[] }>(
        "/api/decks/level",
        { topic, plan, levelId: level.id, avoid, notes },
        signal
      );
      cards[level.id] = questions;
      for (const q of questions) avoid.push(q.kind === "truefalse" ? q.statement : q.prompt);
    } catch (error) {
      // A level that fails after the first one is written leaves a shorter
      // but playable deck; a failure before that is a failure.
      if (!build.deck) throw error;
      build.status = {
        phase: "error",
        message: error instanceof Error ? error.message : String(error),
      };
      build.pending = [];
      emit();
      return build.deck;
    }
    build.deck = assembleDeck(plan, cards, slug);
    build.pending = plan.levels.slice(i + 1);
    saveDeck(build.deck);
    if (i === 0) onPlayable?.(build.deck);
    emit();
  }

  build.status = { phase: "ready" };
  emit();
  return build.deck!;
}
