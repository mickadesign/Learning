import {
  cardPicture,
  type ChoiceQuestion,
  type QuizLevel,
  type TrueFalseQuestion,
} from "@/lib/deck";

export type IllustratedCard = ChoiceQuestion | TrueFalseQuestion;

const LANDING_DESIGN_PREVIEWS = [
  {
    id: "landing-bezier-curve",
    kind: "choice",
    prompt: "How many control points shape a cubic Bézier curve?",
    options: ["Two", "One", "Three", "Four"],
    fact:
      "A cubic Bézier curve uses two endpoints and two control points to define its shape.",
    image: "/images/bezier-curve.svg",
    imageAlt:
      "A curved line with two endpoints and two offset control points",
    imageCredit: { title: "Cubic Bézier curve" },
  },
  {
    id: "landing-oklch-color",
    kind: "choice",
    prompt: "Which OKLCH value controls color intensity?",
    options: ["Chroma", "Lightness", "Hue", "Opacity"],
    fact:
      "In OKLCH, L is lightness, C is chroma, and H is the hue angle.",
    image: "/images/oklch-color-space.svg",
    imageAlt: "A spectrum of vivid colors arranged at even lightness",
    imageCredit: { title: "OKLCH color space" },
  },
] satisfies IllustratedCard[];

/** The first three playable cards that carry artwork. */
export function deckIllustratedCards(levels: QuizLevel[]): IllustratedCard[] {
  return levels
    .flatMap((level) => level.questions)
    .filter(
      (question): question is IllustratedCard =>
        question.kind !== "order" && !!cardPicture(question)
    )
    .slice(0, 3);
}

/** Landing-only examples: design engineering on the edges, deck in the middle. */
export function landingIllustratedCards(
  levels: QuizLevel[]
): IllustratedCard[] {
  const deckCards = deckIllustratedCards(levels);
  const middleCard = deckCards[1] ?? deckCards[0];

  return middleCard
    ? [LANDING_DESIGN_PREVIEWS[0], middleCard, LANDING_DESIGN_PREVIEWS[1]]
    : LANDING_DESIGN_PREVIEWS;
}

/** Up to three pictures from a deck, in card order. Either image slot counts. */
export function deckThumbnails(levels: QuizLevel[]): string[] {
  return deckIllustratedCards(levels).map((question) => cardPicture(question)!);
}
