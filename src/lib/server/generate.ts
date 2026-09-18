// Deck generation with Claude, in two passes: a plan (metadata + level
// briefs) and then the cards of one level at a time. Small requests keep the
// site responsive: the first level is playable while the rest are written.
// Used by the API routes and by scripts/generate-deck.mts.

import { readFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import {
  ChoiceQuestionSchema,
  DeckPlanSchema,
  OrderQuestionSchema,
  PictureHintSchema,
  TrueFalseQuestionSchema,
  type DeckPlan,
  type LevelBrief,
  type QuizQuestion,
} from "../deck.ts";
import { attachPicture as resolvePicture } from "../image-search.ts";

export const MODEL = process.env.FLASHCARDS_MODEL ?? "claude-opus-5";
/** Thinking depth for the card-writing pass. Facts must be right, so the
 *  default leans on quality; "low" roughly halves the wait. */
const EFFORT = (process.env.FLASHCARDS_EFFORT ?? "medium") as
  | "low"
  | "medium"
  | "high";

/** Pictures: the writer names the Wikipedia article of the thing a card
 *  shows; the server fetches that article's lead image and credits it.
 *  FLASHCARDS_IMAGES=off keeps decks text-only. */
const IMAGES = process.env.FLASHCARDS_IMAGES !== "off";

/** What the writer returns: cards, each optionally naming its picture. */
const AuthoredCardsSchema = z.object({
  questions: z
    .array(
      z.discriminatedUnion("kind", [
        ChoiceQuestionSchema.extend({ picture: PictureHintSchema.optional() }),
        TrueFalseQuestionSchema.extend({ picture: PictureHintSchema.optional() }),
        OrderQuestionSchema,
      ])
    )
    .min(1),
});
type AuthoredCard = z.infer<typeof AuthoredCardsSchema>["questions"][number];

/** Resolve a card's picture hint to a real, credited image (the shared
 *  resolver in image-search) — or drop the hint when images are off or the
 *  article has no reusable lead image. */
async function attachPicture(card: AuthoredCard, id: string): Promise<QuizQuestion> {
  if (card.kind === "order") return { ...card, id };
  if (!IMAGES) {
    const { picture: _drop, ...rest } = card;
    void _drop;
    return { ...rest, id } as QuizQuestion;
  }
  const { card: resolved } = await resolvePicture(card);
  return { ...resolved, id } as QuizQuestion;
}

/** True when the server has credentials to call Claude. */
export function generationAvailable(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let brief: string | null = null;
/** The house style every generated deck follows — prompts/new-deck.md. */
function houseBrief(): string {
  brief ??= readFileSync(path.join(process.cwd(), "prompts/new-deck.md"), "utf8");
  return brief;
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export class GenerationRefused extends Error {
  constructor() {
    super("Claude declined to write this deck.");
    this.name = "GenerationRefused";
  }
}

export interface PlanOptions {
  /** Free-form guidance from the author (available images, constraints). */
  notes?: string;
  /** How many levels to plan. @default 4 */
  levels?: number;
  /** Cards per level, passed on to the writer. @default 10 */
  cards?: number;
}

/** Pass one: deck metadata and level briefs, no cards. */
export async function planDeck(
  topic: string,
  { notes, levels = 4, cards = 10 }: PlanOptions = {}
): Promise<DeckPlan> {
  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 8000,
    output_config: { effort: "low", format: zodOutputFormat(DeckPlanSchema) },
    system: houseBrief(),
    messages: [
      {
        role: "user",
        content: [
          `Topic: ${topic}`,
          notes ? `\nNotes from the author:\n${notes}` : "",
          `\nThis is the planning pass. Return the deck's metadata (slug, title, headline as a question, tagline, 1–3 intro paragraphs, cta, verdicts flavoured by the topic, passScore, timerSeconds) and ${levels} level briefs — no cards yet. Each brief has id, name, tagline, timed, optional timerSeconds, hidden, and a one-line \`focus\` telling the card writer what this level tests. Follow the ramp: level 1 famous basics; level 2 relationships and "why"; level 3 exact numbers and deep cuts, timed; the last level hidden, timed on 10 seconds, mixing every trick. Each level will get ${cards} cards. passScore must be at most ${cards}.`,
        ].join("\n"),
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new GenerationRefused();
  if (!response.parsed_output)
    throw new Error("The plan didn't match the deck format. Try again.");
  return response.parsed_output;
}

export interface WriteLevelOptions {
  topic: string;
  plan: DeckPlan;
  level: LevelBrief;
  /** Prompts already used by earlier levels, so cards don't repeat. */
  avoid?: string[];
  cards?: number;
  notes?: string;
}

/** Pass two: the cards of one level. Ids are rewritten to `<level>-<n>` so
 *  levels written independently can never collide. */
export async function writeLevel({
  topic,
  plan,
  level,
  avoid = [],
  cards = 10,
  notes,
}: WriteLevelOptions): Promise<QuizQuestion[]> {
  const position = plan.levels.findIndex((l) => l.id === level.id) + 1;
  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: EFFORT, format: zodOutputFormat(AuthoredCardsSchema) },
    system: houseBrief(),
    messages: [
      {
        role: "user",
        content: [
          `Topic: ${topic}`,
          `Deck: "${plan.title}" — ${plan.headline} ${plan.tagline}`,
          notes ? `\nNotes from the author:\n${notes}` : "",
          `\nWrite the ${cards} cards for level ${position} of ${plan.levels.length}: "${level.name}" — ${level.tagline}`,
          `Focus: ${level.focus}`,
          level.timed
            ? `This level is timed (${level.timerSeconds ?? plan.timerSeconds} seconds per card), so prompts must be readable at a glance.`
            : "",
          `Mix the kinds (about six choice, two truefalse, one or two order). options[0] is the correct answer. Every card has a one-line fact. Don't set image or revealImage yourself unless the notes list images.`,
          IMAGES
            ? `Pictures: where a real picture would help a card — a work of art, a building, a species, an object, a place — set picture: { wikipediaTitle, slot, alt } with the exact English Wikipedia article title of the thing pictured; the site fetches that article's lead image and credits it. slot "image" for "what is this?" cards, "revealImage" for cards whose answer the picture would give away. Only name an article you are sure exists; leave picture out otherwise. Order cards take no picture.`
            : "",
          avoid.length
            ? `\nAlready asked in earlier levels — do not repeat or lightly rephrase these:\n${avoid.map((a) => `- ${a}`).join("\n")}`
            : "",
        ].join("\n"),
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new GenerationRefused();
  if (!response.parsed_output)
    throw new Error(`The ${level.name} level didn't match the card format. Try again.`);
  return Promise.all(
    response.parsed_output.questions.map((q, i) => attachPicture(q, `${level.id}-${i + 1}`))
  );
}

/** The prompts a level asks, for the next level's avoid list. */
export function promptsOf(questions: QuizQuestion[]): string[] {
  return questions.map((q) => (q.kind === "truefalse" ? q.statement : q.prompt));
}
