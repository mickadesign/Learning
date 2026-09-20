// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bestScoresFor,
  deckFingerprint,
  getDraft,
  getSavedDeck,
  getShareLink,
  listDrafts,
  listSavedDecks,
  removeDeck,
  removeDraft,
  saveDeck,
  saveDraft,
  setShareLink,
  uniqueSlug,
} from "@/lib/deck-store";
import { choice, deckFixture } from "./fixtures";

beforeEach(() => {
  localStorage.clear();
});

describe("saved decks", () => {
  it("starts empty and round-trips a deck", () => {
    expect(listSavedDecks()).toEqual([]);
    const deck = deckFixture();
    saveDeck(deck);
    expect(listSavedDecks()).toHaveLength(1);
    expect(getSavedDeck("test-deck")?.title).toBe("Test deck");
  });

  it("replaces by slug instead of duplicating", () => {
    saveDeck(deckFixture({ title: "First" }));
    saveDeck(deckFixture({ title: "Second" }));
    expect(listSavedDecks()).toHaveLength(1);
    expect(getSavedDeck("test-deck")?.title).toBe("Second");
  });

  it("removes by slug and notifies listeners", () => {
    const listener = vi.fn();
    window.addEventListener("flashcards:decks", listener);
    saveDeck(deckFixture());
    removeDeck("test-deck");
    expect(listSavedDecks()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("drops stored decks that no longer match the schema instead of crashing", () => {
    localStorage.setItem(
      "flashcards:decks:v1",
      JSON.stringify([deckFixture(), { slug: "broken", title: "no levels" }])
    );
    expect(listSavedDecks().map((d) => d.slug)).toEqual(["test-deck"]);
  });

  it("survives unreadable storage", () => {
    localStorage.setItem("flashcards:decks:v1", "{not json");
    expect(listSavedDecks()).toEqual([]);
  });
});

describe("drafts", () => {
  it("keeps drafts apart from decks and allows empty levels", () => {
    saveDraft({
      slug: "draft",
      title: "Draft",
      headline: "D?",
      tagline: "t",
      verdicts: { low: "a", mid: "b", high: "c", perfect: "d" },
      passScore: 7,
      timerSeconds: 20,
      intro: [],
      cta: "Test knowledge",
      levels: [{ id: "one", name: "One", tagline: "t", timed: false, hidden: false, questions: [] }],
    });
    expect(listDrafts()).toHaveLength(1);
    expect(listSavedDecks()).toEqual([]);
    expect(getDraft("draft")?.levels[0].questions).toEqual([]);
    removeDraft("draft");
    expect(listDrafts()).toEqual([]);
  });
});

describe("uniqueSlug", () => {
  it("returns the base when free and numbers it otherwise", () => {
    expect(uniqueSlug("coffee", [])).toBe("coffee");
    expect(uniqueSlug("coffee", ["coffee"])).toBe("coffee-2");
    expect(uniqueSlug("coffee", ["coffee", "coffee-2", "coffee-3"])).toBe("coffee-4");
  });
});

describe("best scores", () => {
  it("reads the quiz's per-deck score blob", () => {
    localStorage.setItem("test-deck-quiz-v1", JSON.stringify({ best: { one: 8 } }));
    expect(bestScoresFor("test-deck")).toEqual({ one: 8 });
    expect(bestScoresFor("other")).toEqual({});
  });
});

describe("share links", () => {
  it("remembers a link for exactly this deck's content", () => {
    const deck = deckFixture();
    expect(getShareLink(deck)).toBeUndefined();
    setShareLink(deck, "https://example.test/d/abc");
    expect(getShareLink(deck)).toBe("https://example.test/d/abc");
  });

  it("forgets the link once the deck changes", () => {
    const deck = deckFixture();
    setShareLink(deck, "https://example.test/d/abc");
    const changed = deckFixture({ questions: [choice("one-1"), choice("one-2")] });
    expect(changed.slug).toBe(deck.slug);
    expect(getShareLink(changed)).toBeUndefined();
  });

  it("fingerprints differ for different decks and match for equal ones", () => {
    expect(deckFingerprint(deckFixture())).toBe(deckFingerprint(deckFixture()));
    expect(deckFingerprint(deckFixture())).not.toBe(deckFingerprint(deckFixture({ title: "Other" })));
  });
});
