import {
  cardPicture,
  type ChoiceQuestion,
  type QuizLevel,
  type TrueFalseQuestion,
} from "@/lib/deck";

export type IllustratedCard = ChoiceQuestion | TrueFalseQuestion;

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

/** Up to three pictures from a deck, in card order. Either image slot counts. */
export function deckThumbnails(levels: QuizLevel[]): string[] {
  return deckIllustratedCards(levels).map((question) => cardPicture(question)!);
}
