// Decks people make live in their browser: a localStorage list, read through
// useSyncExternalStore so every part of the page sees the same decks. Best
// scores are stored separately by the quiz (`<slug>-quiz-v1`).

import { useSyncExternalStore } from "react";
import { DeckSchema, type Deck } from "./deck";

const KEY = "flashcards:decks:v1";
const EVENT = "flashcards:decks";

let cacheRaw: string | null | undefined;
let cacheDecks: Deck[] = [];
const EMPTY: Deck[] = [];

function read(): Deck[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cacheRaw) return cacheDecks;
  cacheRaw = raw;
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown[]) : [];
    // Drop anything that no longer matches the format rather than crashing.
    cacheDecks = parsed.flatMap((d) => {
      const r = DeckSchema.safeParse(d);
      return r.success ? [r.data] : [];
    });
  } catch {
    cacheDecks = EMPTY;
  }
  return cacheDecks;
}

function write(decks: Deck[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(decks));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function listSavedDecks(): Deck[] {
  if (typeof window === "undefined") return EMPTY;
  return read();
}

/** Insert or replace by slug. */
export function saveDeck(deck: Deck) {
  const others = read().filter((d) => d.slug !== deck.slug);
  write([...others, deck]);
}

export function removeDeck(slug: string) {
  write(read().filter((d) => d.slug !== slug));
}

/** A slug nobody else uses, among the given taken ones. */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(base)) return base;
  for (let i = 2; ; i++) if (!set.has(`${base}-${i}`)) return `${base}-${i}`;
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function useSavedDecks(): Deck[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** Best scores the quiz has saved for a deck, by level id. */
export function bestScoresFor(slug: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(`${slug}-quiz-v1`);
    if (!raw) return {};
    return (JSON.parse(raw) as { best?: Record<string, number> }).best ?? {};
  } catch {
    return {};
  }
}
