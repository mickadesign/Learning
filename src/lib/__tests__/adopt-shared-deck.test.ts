// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { adoptSharedDeck } from "@/lib/adopt-shared-deck";
import { getShareLink, listSavedDecks, saveDeck } from "@/lib/deck-store";
import { choice, deckFixture } from "./fixtures";

const BUILT_IN = deckFixture({ slug: "art-timeline", title: "Art Timeline" });
const ORIGIN = "https://site.test";

beforeEach(() => {
  localStorage.clear();
});

describe("adoptSharedDeck", () => {
  it("saves a new deck under its own slug and remembers the link", () => {
    const shared = { deck: deckFixture({ slug: "coffee", title: "Coffee" }), id: "abcdefghjk" };
    const adopted = adoptSharedDeck(shared, BUILT_IN, ORIGIN);
    expect(adopted.slug).toBe("coffee");
    expect(listSavedDecks().map((d) => d.slug)).toEqual(["coffee"]);
    expect(getShareLink(adopted)).toBe("https://site.test/d/abcdefghjk");
  });

  it("recognises the same deck already saved and doesn't duplicate it", () => {
    saveDeck(deckFixture({ slug: "coffee", title: "Coffee" }));
    const adopted = adoptSharedDeck({ deck: deckFixture({ slug: "coffee", title: "Coffee" }), id: "abcdefghjk" }, BUILT_IN, ORIGIN);
    expect(adopted.slug).toBe("coffee");
    expect(listSavedDecks()).toHaveLength(1);
    expect(getShareLink(adopted)).toBe("https://site.test/d/abcdefghjk");
  });

  it("renames a shared deck whose slug is taken by a different deck, and links the renamed copy", () => {
    const mine = deckFixture({ slug: "coffee", title: "My coffee" });
    saveDeck(mine);
    const theirs = deckFixture({ slug: "coffee", title: "Their coffee", questions: [choice("one-1"), choice("one-2")] });
    const adopted = adoptSharedDeck({ deck: theirs, id: "abcdefghjk" }, BUILT_IN, ORIGIN);
    expect(adopted.slug).toBe("coffee-2");
    expect(listSavedDecks().map((d) => [d.slug, d.title])).toEqual([
      ["coffee", "My coffee"],
      ["coffee-2", "Their coffee"],
    ]);
    expect(getShareLink(adopted)).toBe("https://site.test/d/abcdefghjk");
    expect(getShareLink(mine)).toBeUndefined();
  });

  it("finds a deck saved moments ago, without any React snapshot", () => {
    saveDeck(deckFixture({ slug: "coffee", title: "First" }));
    saveDeck(deckFixture({ slug: "coffee-2", title: "Second" }));
    const adopted = adoptSharedDeck({ deck: deckFixture({ slug: "coffee", title: "Third" }), id: "abcdefghjk" }, BUILT_IN, ORIGIN);
    expect(adopted.slug).toBe("coffee-3");
  });

  it("never saves a copy of the built-in deck, but steps aside from its slug for a different deck", () => {
    const same = adoptSharedDeck({ deck: BUILT_IN, id: "abcdefghjk" }, BUILT_IN, ORIGIN);
    expect(same.slug).toBe("art-timeline");
    expect(listSavedDecks()).toEqual([]);
    const other = deckFixture({ slug: "art-timeline", title: "Not the built-in one" });
    const adopted = adoptSharedDeck({ deck: other, id: "zzzzzzzzzz" }, BUILT_IN, ORIGIN);
    expect(adopted.slug).toBe("art-timeline-2");
    expect(listSavedDecks().map((d) => d.slug)).toEqual(["art-timeline-2"]);
  });
});
