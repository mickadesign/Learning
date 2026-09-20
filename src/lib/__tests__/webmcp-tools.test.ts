// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost:3000/"}
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Deck } from "@/lib/deck";
import { listSavedDecks, saveDeck } from "@/lib/deck-store";
import { choice, deckFixture, order, rawDeck, trueFalse } from "./fixtures";

// The tools without the page: handlers backed by local storage plus one
// built-in deck, pictures resolved by a fake, sharing answered by a fake.

vi.mock("@/lib/image-search", async (orig) => {
  const actual = await orig<typeof import("@/lib/image-search")>();
  return {
    ...actual,
    attachPicture: vi.fn(async (card: { kind: string; picture?: { wikipediaTitle: string; alt: string; slot?: string } }) => {
      const { picture, ...bare } = card;
      if (!picture || card.kind === "order") return { card: bare, found: null };
      if (picture.wikipediaTitle === "Missing") return { card: bare, found: null };
      const slot = card.kind === "truefalse" ? "revealImage" : (picture.slot ?? "revealImage");
      const source = `https://en.wikipedia.org/wiki/${encodeURIComponent(picture.wikipediaTitle)}`;
      const found = { url: `https://img.test/${encodeURIComponent(picture.wikipediaTitle)}.jpg`, title: picture.wikipediaTitle, source, origin: "wikipedia" as const };
      return { card: { ...bare, [slot]: found.url, imageAlt: picture.alt, imageCredit: { title: picture.wikipediaTitle, source } }, found };
    }),
  };
});

vi.mock("@/lib/share", async (orig) => {
  const actual = await orig<typeof import("@/lib/share")>();
  return { ...actual, shareDeck: vi.fn(async (deck: Deck) => `https://site.test/d/${deck.slug}`) };
});

import { shareDeck, SharingUnavailable } from "@/lib/share";
import {
  flashcardTools,
  getAgentActivity,
  resetAgentActivity,
  type FlashcardToolHandlers,
  type ToolDef,
} from "@/lib/webmcp";

const BUILT_IN = deckFixture({ slug: "built-in", title: "Built in" });

function handlers(): FlashcardToolHandlers & { opened: Deck[]; fresh: boolean[] } {
  const opened: Deck[] = [];
  const fresh: boolean[] = [];
  const summary = (d: Deck, builtIn: boolean) => ({
    slug: d.slug,
    title: d.title,
    headline: d.headline,
    builtIn,
    levels: d.levels.map((l) => ({ id: l.id, name: l.name, cards: l.questions.length, timed: l.timed, hidden: l.hidden })),
  });
  return {
    opened,
    fresh,
    generateDeck: vi.fn(async () => BUILT_IN),
    openDeck: (deck, options) => {
      opened.push(deck);
      fresh.push(!!options?.fresh);
    },
    playDeck: (slug) => {
      const deck = slug ? [BUILT_IN, ...listSavedDecks()].find((d) => d.slug === slug) : BUILT_IN;
      if (!deck) throw new Error(`No deck "${slug}"`);
      opened.push(deck);
      fresh.push(false);
      return deck;
    },
    listDecks: () => [summary(BUILT_IN, true), ...listSavedDecks().map((d) => summary(d, false))],
    findDeck: (slug) => [BUILT_IN, ...listSavedDecks()].find((d) => d.slug === slug),
    deleteDeck: vi.fn(),
  };
}

let h: ReturnType<typeof handlers>;
let tools: Map<string, ToolDef>;
const call = async (name: string, input: unknown = {}) => {
  const def = tools.get(name);
  if (!def) throw new Error(`no tool ${name}`);
  return def.execute(input);
};
const textOf = (r: { content: ReadonlyArray<unknown> }) => (r.content[0] as { text?: string }).text ?? "";
const data = <T = Record<string, unknown>>(r: { structuredContent?: unknown }) => r.structuredContent as T;

const START = {
  title: "Coffee brewing",
  headline: "Are you a coffee nerd?",
  tagline: "Beans, water, time.",
  verdicts: { low: "a", mid: "b", high: "c", perfect: "d" },
  passScore: 1,
  levels: [{ id: "basics", name: "Basics", tagline: "The essentials." }],
};

beforeEach(() => {
  localStorage.clear();
  resetAgentActivity();
  h = handlers();
  tools = new Map(flashcardTools(() => h).map((t) => [t.name, t]));
});

describe("the tool set", () => {
  it("registers the twelve documented tools with JSON input schemas", () => {
    expect([...tools.keys()].sort()).toEqual(
      [
        "add_flashcards",
        "delete_flashcard_deck",
        "find_flashcard_images",
        "generate_flashcards",
        "get_flashcard_deck",
        "get_flashcard_format",
        "import_flashcards",
        "list_flashcard_decks",
        "play_flashcards",
        "publish_flashcard_deck",
        "share_flashcard_deck",
        "start_flashcard_deck",
      ].sort()
    );
    for (const def of tools.values()) expect(def.inputSchema).toMatchObject({ type: "object" });
  });

  it("publishes the picture hint with the slot optional", () => {
    const schema = JSON.stringify(tools.get("add_flashcards")!.inputSchema);
    expect(schema).toContain("wikipediaTitle");
    const required = [...schema.matchAll(/"required":\[("wikipediaTitle"[^\]]*)\]/g)].map((m) => m[1]);
    expect(required.length).toBeGreaterThan(0);
    for (const r of required) expect(r).not.toContain("slot");
  });
});

describe("get_flashcard_format", () => {
  it("is a short guide by default and hands out examples and the schema on request", async () => {
    const guide = textOf(await call("get_flashcard_format"));
    expect(guide).toMatch(/start_flashcard_deck/);
    expect(guide).toMatch(/picture: \{ wikipediaTitle/);
    expect(guide.length).toBeLessThan(6000);
    expect(guide).not.toContain('"kind": "order"');
    const examples = await call("get_flashcard_format", { section: "examples" });
    expect(data<{ examples: unknown[] }>(examples).examples.length).toBeGreaterThan(2);
    const schema = await call("get_flashcard_format", { section: "schema" });
    expect(data<{ schema: { required: string[] } }>(schema).schema.required).toContain("levels");
  });
});

describe("writing a deck step by step", () => {
  it("starts a draft, adds cards with ids assigned, and publishes it open", async () => {
    const started = await call("start_flashcard_deck", START);
    const { slug } = data<{ slug: string; levels: string[] }>(started);
    expect(slug).toBe("coffee-brewing");
    expect(data(started).levels).toEqual(["basics"]);

    const added = await call("add_flashcards", {
      slug,
      level: "basics",
      cards: [
        { ...choice("x"), id: undefined },
        { ...trueFalse("y"), id: undefined },
        { ...order("z"), id: undefined },
      ],
    });
    const info = data<{ added: string[]; gaps: string[]; pictures: { withoutPicture: number } }>(added);
    expect(info.added).toEqual(["basics-1", "basics-2", "basics-3"]);
    expect(info.gaps).toEqual([]);
    expect(info.pictures.withoutPicture).toBe(2);
    expect(textOf(added)).toMatch(/2 cards in this level still have no picture/);

    const published = await call("publish_flashcard_deck", { slug });
    expect(textOf(published)).toMatch(/Published "Coffee brewing"/);
    expect(h.opened.map((d) => d.slug)).toEqual([slug]);
    expect(listSavedDecks().map((d) => d.slug)).toEqual([slug]);
    expect(getAgentActivity()).toMatchObject({ phase: "done", deck: { slug } });
    // A deck made just now opens as its unlock moment; playing it later doesn't.
    expect(h.fresh).toEqual([true]);
    await call("play_flashcards", { slug });
    expect(h.fresh).toEqual([true, false]);
  });

  it("refuses to publish a draft that can't pass, naming the gap", async () => {
    const { slug } = data<{ slug: string }>(await call("start_flashcard_deck", { ...START, passScore: 3 }));
    await call("add_flashcards", { slug, level: "basics", cards: [{ ...choice("x"), id: undefined }] });
    await expect(call("publish_flashcard_deck", { slug })).rejects.toThrow(/has 1 cards but passScore is 3/);
  });

  it("rejects a whole batch when one card is invalid, by path", async () => {
    const { slug } = data<{ slug: string }>(await call("start_flashcard_deck", START));
    await expect(
      call("add_flashcards", { slug, level: "basics", cards: [{ ...choice("ok"), id: undefined }, { kind: "choice", prompt: "p", options: ["only one"], fact: "f" }] })
    ).rejects.toThrow(/cards\.1\.options/);
    await expect(
      call("add_flashcards", { slug, level: "basics", cards: [{ ...choice("dup"), id: undefined, options: ["a", "a"] }] })
    ).rejects.toThrow(/options must be distinct/);
    await expect(call("add_flashcards", { slug, level: "nope", cards: [{ ...choice("x"), id: undefined }] })).rejects.toThrow(/No level "nope"/);
  });

  it("resolves picture hints, reports the ones that found nothing, and refuses a hint next to an explicit picture", async () => {
    const { slug } = data<{ slug: string }>(await call("start_flashcard_deck", START));
    const added = await call("add_flashcards", {
      slug,
      level: "basics",
      cards: [
        { ...choice("a"), id: undefined, picture: { wikipediaTitle: "Mona Lisa", alt: "A portrait." } },
        { ...trueFalse("b"), id: undefined, picture: { wikipediaTitle: "Missing", alt: "x" } },
      ],
    });
    const info = data<{ pictures: { attached: string[]; missing: string[]; withoutPicture: number } }>(added);
    expect(info.pictures).toEqual({ attached: ["basics-1"], missing: ["Missing"], withoutPicture: 1 });
    expect(textOf(added)).toMatch(/no free image for "Missing"/);
    const deck = data<{ deck: Deck }>(await call("get_flashcard_deck", { slug })).deck;
    expect(deck.levels[0].questions[0]).toMatchObject({ revealImage: "https://img.test/Mona%20Lisa.jpg", imageAlt: "A portrait." });

    await expect(
      call("add_flashcards", {
        slug,
        level: "basics",
        cards: [{ ...choice("c"), id: undefined, image: "https://x.test/a.jpg", picture: { wikipediaTitle: "Mona Lisa", alt: "x" } }],
      })
    ).rejects.toThrow(/use picture or image\/revealImage, not both/);
  });

  it("keeps ids unique across the deck", async () => {
    const { slug } = data<{ slug: string }>(await call("start_flashcard_deck", START));
    await call("add_flashcards", { slug, level: "basics", cards: [{ ...choice("basics-1") }] });
    await expect(call("add_flashcards", { slug, level: "basics", cards: [{ ...choice("basics-1") }] })).rejects.toThrow(/already used/);
    const more = await call("add_flashcards", { slug, level: "basics", cards: [{ ...choice("q"), id: undefined }] });
    expect(data<{ added: string[] }>(more).added).toEqual(["basics-2"]);
  });
});

describe("import_flashcards", () => {
  it("saves and opens a complete deck, taking a fresh slug when the wanted one is used", async () => {
    saveDeck(deckFixture({ slug: "raw-deck", title: "Already here" }));
    const res = await call("import_flashcards", { deck: rawDeck() });
    expect(data<{ slug: string }>(res).slug).toBe("raw-deck-2");
    expect(h.opened.at(-1)?.slug).toBe("raw-deck-2");
    expect(h.fresh.at(-1)).toBe(true);
    const replaced = await call("import_flashcards", { deck: rawDeck(), replace: true });
    expect(data<{ slug: string }>(replaced).slug).toBe("raw-deck");
  });

  it("resolves hints before validating and rejects a malformed one by path", async () => {
    const withHint = rawDeck({ levels: [{ id: "l", name: "L", tagline: "t", questions: [{ ...choice("l-1"), picture: { wikipediaTitle: "Mona Lisa", alt: "x" } }] }] });
    await call("import_flashcards", { deck: withHint });
    expect((listSavedDecks()[0].levels[0].questions[0] as { revealImage?: string }).revealImage).toBe("https://img.test/Mona%20Lisa.jpg");

    const bad = rawDeck({ slug: "bad", levels: [{ id: "l", name: "L", tagline: "t", questions: [{ ...choice("l-1"), picture: { wikipediaTitle: "Mona Lisa" } }] }] });
    await expect(call("import_flashcards", { deck: bad })).rejects.toThrow(/levels\.0\.questions\.0\.picture: alt/);
    expect(listSavedDecks().map((d) => d.slug)).not.toContain("bad");
  });

  it("rejects an invalid deck with the schema's message", async () => {
    await expect(call("import_flashcards", { deck: rawDeck({ passScore: 9 }) })).rejects.toThrow(/passScore/);
  });
});

describe("listing, playing, deleting", () => {
  it("lists the built-in deck first with saved ones and drafts after", async () => {
    saveDeck(deckFixture({ slug: "mine", title: "Mine" }));
    await call("start_flashcard_deck", START);
    const res = data<{ decks: { slug: string; builtIn: boolean }[]; drafts: { slug: string }[] }>(await call("list_flashcard_decks"));
    expect(res.decks.map((d) => d.slug)).toEqual(["built-in", "mine"]);
    expect(res.decks[0].builtIn).toBe(true);
    expect(res.drafts.map((d) => d.slug)).toEqual(["coffee-brewing"]);
  });

  it("opens a deck by slug, or the built-in one, and errors on unknown slugs", async () => {
    saveDeck(deckFixture({ slug: "mine", title: "Mine" }));
    await call("play_flashcards", { slug: "mine" });
    await call("play_flashcards");
    expect(h.opened.map((d) => d.slug)).toEqual(["mine", "built-in"]);
    await expect(call("play_flashcards", { slug: "ghost" })).rejects.toThrow(/No deck "ghost"/);
  });

  it("deletes saved decks and drafts, never the built-in one", async () => {
    saveDeck(deckFixture({ slug: "mine", title: "Mine" }));
    await call("start_flashcard_deck", START);
    expect(textOf(await call("delete_flashcard_deck", { slug: "mine" }))).toMatch(/Deleted deck/);
    expect(textOf(await call("delete_flashcard_deck", { slug: "coffee-brewing" }))).toMatch(/Deleted draft/);
    await expect(call("delete_flashcard_deck", { slug: "built-in" })).rejects.toThrow();
    expect(listSavedDecks()).toEqual([]);
  });
});

describe("share_flashcard_deck", () => {
  it("returns the link for a saved deck and the site root for the built-in one", async () => {
    saveDeck(deckFixture({ slug: "mine", title: "Mine" }));
    const res = await call("share_flashcard_deck", { slug: "mine" });
    expect(data<{ url: string }>(res).url).toBe("https://site.test/d/mine");
    expect(textOf(res)).toMatch(/shareable at https:\/\/site\.test\/d\/mine/);
    const builtIn = await call("share_flashcard_deck", { slug: "built-in" });
    expect(data<{ url: string }>(builtIn).url).toBe("http://localhost:3000/");
    expect(vi.mocked(shareDeck)).toHaveBeenCalledTimes(1);
  });

  it("explains when the deployment can't share, and refuses drafts", async () => {
    saveDeck(deckFixture({ slug: "mine", title: "Mine" }));
    vi.mocked(shareDeck).mockRejectedValueOnce(new SharingUnavailable("Sharing isn't set up on this deployment."));
    await expect(call("share_flashcard_deck", { slug: "mine" })).rejects.toThrow(/saved in this browser only/);
    await call("start_flashcard_deck", START);
    await expect(call("share_flashcard_deck", { slug: "coffee-brewing" })).rejects.toThrow(/published first/);
  });
});

describe("agent activity", () => {
  it("stays idle through reads and starts working, with the title, on a writing call", async () => {
    await call("get_flashcard_format");
    await call("list_flashcard_decks");
    expect(getAgentActivity()).toEqual({ phase: "idle" });
    await call("start_flashcard_deck", START);
    expect(getAgentActivity()).toMatchObject({ phase: "working", tool: "start_flashcard_deck", title: "Coffee brewing" });
    const since = (getAgentActivity() as { since: number }).since;
    await call("add_flashcards", { slug: "coffee-brewing", level: "basics", cards: [{ ...choice("x"), id: undefined }] });
    expect(getAgentActivity()).toMatchObject({ phase: "working", tool: "add_flashcards", title: "Coffee brewing", since });
  });

  it("marks the deck done on publish and is not disturbed by reads or play afterwards", async () => {
    await call("start_flashcard_deck", START);
    await call("add_flashcards", { slug: "coffee-brewing", level: "basics", cards: [{ ...choice("x"), id: undefined }] });
    await call("publish_flashcard_deck", { slug: "coffee-brewing" });
    expect(getAgentActivity().phase).toBe("done");
    await call("get_flashcard_deck", { slug: "coffee-brewing" });
    await call("play_flashcards", { slug: "coffee-brewing" });
    await call("share_flashcard_deck", { slug: "coffee-brewing" });
    expect(getAgentActivity().phase).toBe("done");
  });

  it("names the draft from the slug on later calls after a reload", async () => {
    await call("start_flashcard_deck", START);
    resetAgentActivity();
    await call("add_flashcards", { slug: "coffee-brewing", level: "basics", cards: [{ ...choice("x"), id: undefined }] });
    expect(getAgentActivity()).toMatchObject({ phase: "working", title: "Coffee brewing" });
  });
});
