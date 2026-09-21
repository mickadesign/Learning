import { describe, expect, it } from "vitest";
import type { QuizLevel } from "@/lib/deck";
import {
  deckIllustratedCards,
  landingIllustratedCards,
} from "@/lib/deck-thumbnails";

const levels: QuizLevel[] = [
  {
    id: "sample",
    name: "Sample",
    tagline: "Sample cards",
    timed: false,
    hidden: false,
    questions: [
      {
        id: "deck-one",
        kind: "choice",
        prompt: "First?",
        options: ["Yes", "No"],
        fact: "First fact.",
        image: "/images/one.png",
      },
      {
        id: "deck-two",
        kind: "choice",
        prompt: "Second?",
        options: ["Yes", "No"],
        fact: "Second fact.",
        image: "/images/two.png",
      },
      {
        id: "deck-three",
        kind: "choice",
        prompt: "Third?",
        options: ["Yes", "No"],
        fact: "Third fact.",
        image: "/images/three.png",
      },
    ],
  },
];

describe("deck thumbnails", () => {
  it("keeps deck thumbnails faithful to the quiz", () => {
    expect(deckIllustratedCards(levels).map((card) => card.id)).toEqual([
      "deck-one",
      "deck-two",
      "deck-three",
    ]);
  });

  it("uses design-engineering cards around the deck's center preview", () => {
    expect(landingIllustratedCards(levels).map((card) => card.id)).toEqual([
      "landing-bezier-curve",
      "deck-two",
      "landing-oklch-color",
    ]);
  });
});
