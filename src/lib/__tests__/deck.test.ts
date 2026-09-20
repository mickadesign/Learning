import { describe, expect, it } from "vitest";
import {
  CardInputSchema,
  PictureHintSchema,
  RevealPictureHintSchema,
  assembleDeck,
  cardPicture,
  deckJsonSchema,
  parseDeck,
  shareTextFor,
  slugify,
  verdictFor,
  type DeckPlan,
} from "@/lib/deck";
import { choice, deckFixture, order, rawDeck, trueFalse } from "./fixtures";

describe("parseDeck", () => {
  it("accepts a minimal deck and fills the defaults", () => {
    const seven = Array.from({ length: 7 }, (_, i) => choice(`q${i}`));
    const deck = parseDeck(rawDeck({ passScore: undefined, levels: [{ id: "l", name: "L", tagline: "t", questions: seven }] }));
    expect(deck.passScore).toBe(7);
    expect(deck.timerSeconds).toBe(20);
    expect(deck.levels[0].timed).toBe(false);
    expect(deck.levels[0].hidden).toBe(false);
  });

  it("refuses a passScore higher than a level's card count", () => {
    expect(() => parseDeck(rawDeck({ passScore: 5 }))).toThrow(/passScore \(5\) is higher/);
  });

  it("refuses duplicate question ids across levels", () => {
    const raw = rawDeck({
      levels: [
        { id: "a", name: "A", tagline: "t", questions: [choice("q")] },
        { id: "b", name: "B", tagline: "t", questions: [choice("q")] },
      ],
    });
    expect(() => parseDeck(raw)).toThrow(/duplicate question id "q"/);
  });

  it("refuses duplicate level ids", () => {
    const raw = rawDeck({
      levels: [
        { id: "a", name: "A", tagline: "t", questions: [choice("q1")] },
        { id: "a", name: "A again", tagline: "t", questions: [choice("q2")] },
      ],
    });
    expect(() => parseDeck(raw)).toThrow(/duplicate level id "a"/);
  });

  it("refuses repeated options and tied order items", () => {
    expect(() =>
      parseDeck(rawDeck({ levels: [{ id: "l", name: "L", tagline: "t", questions: [choice("q", { options: ["Paris", "Paris"] })] }] }))
    ).toThrow(/options must be distinct/);
    const tied = {
      ...order("o"),
      items: [
        { label: "A", value: 1 },
        { label: "B", value: 1 },
        { label: "C", value: 2 },
      ],
    };
    expect(() =>
      parseDeck(rawDeck({ levels: [{ id: "l", name: "L", tagline: "t", questions: [tied] }] }))
    ).toThrow(/distinct values/);
  });

  it("strips unknown keys rather than failing on them", () => {
    const deck = parseDeck(rawDeck({ levels: [{ id: "l", name: "L", tagline: "t", questions: [choice("q", { picture: { wikipediaTitle: "x" } })] }] }));
    expect("picture" in deck.levels[0].questions[0]).toBe(false);
  });
});

describe("picture hints", () => {
  it("defaults the slot to revealImage so a picture can't give the answer away", () => {
    expect(PictureHintSchema.parse({ wikipediaTitle: "Mona Lisa", alt: "A portrait." }).slot).toBe("revealImage");
  });

  it("gives true/false cards a hint with no slot at all", () => {
    const parsed = RevealPictureHintSchema.parse({ wikipediaTitle: "Mona Lisa", alt: "A portrait.", slot: "image" });
    expect("slot" in parsed).toBe(false);
  });

  it("accepts hints on choice and truefalse inputs, never on order cards", () => {
    const hint = { wikipediaTitle: "Mona Lisa", alt: "A portrait." };
    expect(CardInputSchema.safeParse({ ...choice("c"), id: undefined, picture: hint }).success).toBe(true);
    expect(CardInputSchema.safeParse({ ...trueFalse("t"), picture: hint }).success).toBe(true);
    const withOrder = CardInputSchema.parse({ ...order("o"), picture: hint });
    expect("picture" in withOrder).toBe(false);
  });

  it("requires alt and a title", () => {
    expect(PictureHintSchema.safeParse({ wikipediaTitle: "Mona Lisa" }).success).toBe(false);
    expect(PictureHintSchema.safeParse({ alt: "x" }).success).toBe(false);
  });
});

describe("picture and credit URLs", () => {
  const withImage = (image: string) => rawDeck({ levels: [{ id: "l", name: "L", tagline: "t", questions: [choice("q", { image })] }] });
  it("takes a path under /public or an https URL for a picture, nothing else", () => {
    expect(() => parseDeck(withImage("/images/starry-night.jpg"))).not.toThrow();
    expect(() => parseDeck(withImage("https://upload.wikimedia.org/x/Foo.jpg"))).not.toThrow();
    for (const bad of ["http://example.com/a.jpg", "javascript:alert(1)", "data:image/png;base64,AAAA", "images/a.jpg", "ftp://x/a.jpg"]) {
      expect(() => parseDeck(withImage(bad)), bad).toThrow(/https URL/);
    }
  });
  it("only links a credit to an http(s) page", () => {
    const withSource = (source: string) =>
      rawDeck({ levels: [{ id: "l", name: "L", tagline: "t", questions: [choice("q", { revealImage: "/a.jpg", imageCredit: { title: "T", source } })] }] });
    expect(() => parseDeck(withSource("https://en.wikipedia.org/wiki/Las_Meninas"))).not.toThrow();
    expect(() => parseDeck(withSource("javascript:alert(1)"))).toThrow(/http\(s\) link/);
    expect(() => parseDeck(withSource("data:text/html,hi"))).toThrow();
  });
});

describe("cardPicture", () => {
  it("prefers the sharp image, falls back to the reveal, and ignores order cards", () => {
    expect(cardPicture(choice("c", { image: "/a.jpg", revealImage: "/b.jpg" }))).toBe("/a.jpg");
    expect(cardPicture(choice("c", { revealImage: "/b.jpg" }))).toBe("/b.jpg");
    expect(cardPicture(trueFalse("t", { revealImage: "/t.jpg" }))).toBe("/t.jpg");
    expect(cardPicture(order("o"))).toBeUndefined();
    expect(cardPicture(choice("c"))).toBeUndefined();
  });
});

describe("verdictFor", () => {
  const deck = deckFixture();
  it("bands the score at 30 %, 60 %, and perfect", () => {
    expect(verdictFor(deck, 0, 10)).toBe("Low.");
    expect(verdictFor(deck, 3, 10)).toBe("Low.");
    expect(verdictFor(deck, 4, 10)).toBe("Mid.");
    expect(verdictFor(deck, 6, 10)).toBe("Mid.");
    expect(verdictFor(deck, 7, 10)).toBe("High.");
    expect(verdictFor(deck, 9, 10)).toBe("High.");
    expect(verdictFor(deck, 10, 10)).toBe("Perfect.");
  });
  it("treats an empty run as the low band instead of dividing by zero", () => {
    expect(verdictFor(deck, 0, 0)).toBe("Low.");
  });
});

describe("shareTextFor", () => {
  const deck = deckFixture({
    passScore: 2,
    levels: [
      { id: "open", name: "Open", tagline: "t", timed: false, hidden: false, questions: [choice("a"), choice("b"), choice("c")] },
      { id: "secret", name: "Secret", tagline: "t", timed: true, hidden: true, questions: [choice("d"), choice("e")] },
    ],
  });
  it("frames a perfect, a pass, and a miss differently", () => {
    expect(shareTextFor(deck, deck.levels[0], 3)).toMatch(/perfect 3\/3/);
    expect(shareTextFor(deck, deck.levels[0], 2)).toMatch(/can you beat me/);
    expect(shareTextFor(deck, deck.levels[0], 1)).toMatch(/Harder than it looks/);
  });
  it("teases a hidden level without saying how to reach it", () => {
    expect(shareTextFor(deck, deck.levels[1], 2)).toMatch(/there's a hidden level/);
    expect(shareTextFor(deck, deck.levels[1], 1)).toMatch(/try finding it/);
  });
});

describe("slugify", () => {
  it("lowercases, strips accents and punctuation, and never returns empty", () => {
    expect(slugify("Wind, Water & the Golden Gate")).toBe("wind-water-the-golden-gate");
    expect(slugify("Café crème!")).toBe("cafe-creme");
    expect(slugify("---")).toBe("deck");
    expect(slugify("x".repeat(80)).length).toBeLessThanOrEqual(48);
  });
});

describe("deckJsonSchema", () => {
  it("is a JSON Schema for the deck with the levels required", () => {
    const schema = deckJsonSchema() as { type: string; required: string[]; properties: Record<string, unknown> };
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(expect.arrayContaining(["slug", "title", "headline", "levels"]));
    expect(schema.properties.levels).toBeDefined();
  });
});

describe("assembleDeck", () => {
  it("keeps the plan's order and leaves unwritten levels out", () => {
    const plan: DeckPlan = {
      slug: "plan",
      title: "Plan",
      headline: "P?",
      tagline: "t",
      verdicts: { low: "a", mid: "b", high: "c", perfect: "d" },
      passScore: 1,
      timerSeconds: 20,
      levels: [
        { id: "one", name: "One", tagline: "t", timed: false, hidden: false, focus: "basics" },
        { id: "two", name: "Two", tagline: "t", timed: false, hidden: false, focus: "deeper" },
      ],
    } as DeckPlan;
    const deck = assembleDeck(plan, { two: [choice("two-1")], one: [choice("one-1")] });
    expect(deck.levels.map((l) => l.id)).toEqual(["one", "two"]);
    const partial = assembleDeck(plan, { one: [choice("one-1")] });
    expect(partial.levels.map((l) => l.id)).toEqual(["one"]);
    expect("focus" in partial.levels[0]).toBe(false);
  });
});
