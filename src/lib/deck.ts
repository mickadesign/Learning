// The deck: everything a fork changes lives in src/data/deck.json and is
// parsed through this schema, so a malformed deck fails loudly at build time
// (and in `npm run check-deck`) instead of rendering a broken card.

import { z } from "zod";

const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "use lowercase letters, digits and dashes");

const imagePath = z
  .string()
  .min(1)
  .describe(
    "Path under /public (e.g. /images/starry-night.jpg) or an absolute https URL"
  );

const QuestionBase = {
  id: z.string().min(1).describe("Unique across the whole deck, e.g. s1, s2"),
  fact: z
    .string()
    .min(1)
    .describe("One-line explanation shown on the reveal, whatever the answer"),
};

/** Multiple choice. `options[0]` is the correct answer; option order is
 *  shuffled per run. Optionally illustrated. */
export const ChoiceQuestionSchema = z.object({
  kind: z.literal("choice"),
  ...QuestionBase,
  prompt: z.string().min(1),
  options: z
    .array(z.string().min(1))
    .min(2)
    .max(6)
    .describe("The first option is the correct one"),
  image: imagePath
    .optional()
    .describe("Shown sharp while answering (\"which movement is this?\")"),
  revealImage: imagePath
    .optional()
    .describe("Shown blurred while answering, sharpened with the answer"),
  imageAlt: z.string().optional(),
});

export const TrueFalseQuestionSchema = z.object({
  kind: z.literal("truefalse"),
  ...QuestionBase,
  statement: z.string().min(1),
  answer: z.boolean(),
  revealImage: imagePath
    .optional()
    .describe("Shown blurred while answering, sharpened on the reveal"),
  imageAlt: z.string().optional(),
});

export const OrderItemSchema = z.object({
  label: z.string().min(1),
  value: z
    .number()
    .describe("Sort key, ascending is correct (a year, a size, a rank…)"),
});

/** Ordering: `items` are listed lowest value first; display order is
 *  shuffled per run and the player taps them back into sequence. */
export const OrderQuestionSchema = z.object({
  kind: z.literal("order"),
  ...QuestionBase,
  prompt: z.string().min(1),
  items: z.array(OrderItemSchema).min(3).max(5),
});

export const QuizQuestionSchema = z.discriminatedUnion("kind", [
  ChoiceQuestionSchema,
  TrueFalseQuestionSchema,
  OrderQuestionSchema,
]);

export const QuizLevelSchema = z.object({
  id: slug,
  name: z.string().min(1).describe("Shown as \"<name> level\""),
  tagline: z.string().min(1),
  /** Timed levels run each card against a countdown. */
  timed: z.boolean().default(false),
  /** Per-card countdown override, in seconds (defaults to the deck's). */
  timerSeconds: z.number().int().positive().optional(),
  /** Hidden levels don't appear in the list until the previous level is
   *  passed; they get the golden beam. */
  hidden: z.boolean().default(false),
  questions: z.array(QuizQuestionSchema).min(1),
});

/** The deck's shape without cross-field checks — what the generator plans
 *  against and what the JSON schema for external authors is derived from. */
export const DeckBaseSchema = z.object({
    /** Namespaces saved progress and share URLs. */
    slug,
    /** Site name: browser tab, share cards. */
    title: z.string().min(1),
    /** The big question on the landing page and level list. */
    headline: z.string().min(1),
    /** One line under the title (metadata, share cards). */
    tagline: z.string().min(1),
    /** Short paragraphs on the landing page: why this deck exists. */
    intro: z.array(z.string().min(1)).default([]),
    /** Label of the button that opens the quiz. */
    cta: z.string().min(1).default("Test knowledge"),
    author: z
      .object({ name: z.string().min(1), url: z.string().url().optional() })
      .optional(),
    /** Score needed on a level to unlock the next one. */
    passScore: z.number().int().positive().default(7),
    /** Default per-card countdown on timed levels, in seconds. */
    timerSeconds: z.number().int().positive().default(20),
    /** Result-screen verdicts by score band: ≤30 %, ≤60 %, <100 %, 100 %. */
    verdicts: z.object({
      low: z.string().min(1),
      mid: z.string().min(1),
      high: z.string().min(1),
      perfect: z.string().min(1),
    }),
    levels: z.array(QuizLevelSchema).min(1),
});

export const DeckSchema = DeckBaseSchema.superRefine((deck, ctx) => {
    const levelIds = new Set<string>();
    const questionIds = new Set<string>();
    deck.levels.forEach((lv, li) => {
      if (levelIds.has(lv.id))
        ctx.addIssue({
          code: "custom",
          path: ["levels", li, "id"],
          message: `duplicate level id "${lv.id}"`,
        });
      levelIds.add(lv.id);
      if (deck.passScore > lv.questions.length)
        ctx.addIssue({
          code: "custom",
          path: ["levels", li, "questions"],
          message: `passScore (${deck.passScore}) is higher than the number of questions (${lv.questions.length})`,
        });
      lv.questions.forEach((q, qi) => {
        const path = ["levels", li, "questions", qi];
        if (questionIds.has(q.id))
          ctx.addIssue({
            code: "custom",
            path: [...path, "id"],
            message: `duplicate question id "${q.id}"`,
          });
        questionIds.add(q.id);
        if (q.kind === "choice" && new Set(q.options).size !== q.options.length)
          ctx.addIssue({
            code: "custom",
            path: [...path, "options"],
            message: "options must be distinct",
          });
        if (q.kind === "order") {
          if (new Set(q.items.map((it) => it.value)).size !== q.items.length)
            ctx.addIssue({
              code: "custom",
              path: [...path, "items"],
              message: "order items need distinct values (ties can't be ordered)",
            });
          if (new Set(q.items.map((it) => it.label)).size !== q.items.length)
            ctx.addIssue({
              code: "custom",
              path: [...path, "items"],
              message: "order items need distinct labels",
            });
        }
      });
    });
});

/** A level without its cards: what the planner returns and the writer fills.
 *  `focus` is a one-line brief for the writer and never reaches the site. */
export const LevelBriefSchema = QuizLevelSchema.omit({ questions: true }).extend({
  focus: z
    .string()
    .min(1)
    .describe("What this level tests and how hard it is, in one line"),
});

/** The generator's first pass: deck metadata plus level briefs, no cards. */
export const DeckPlanSchema = DeckBaseSchema.omit({ levels: true }).extend({
  levels: z.array(LevelBriefSchema).min(1),
});

/** The generator's second pass, once per level. */
export const LevelCardsSchema = z.object({
  questions: z.array(QuizQuestionSchema).min(1),
});

export type Deck = z.infer<typeof DeckSchema>;
export type LevelBrief = z.infer<typeof LevelBriefSchema>;
export type DeckPlan = z.infer<typeof DeckPlanSchema>;
export type QuizLevel = Deck["levels"][number];
export type QuizQuestion = QuizLevel["questions"][number];
export type ChoiceQuestion = Extract<QuizQuestion, { kind: "choice" }>;
export type TrueFalseQuestion = Extract<QuizQuestion, { kind: "truefalse" }>;
export type OrderQuestion = Extract<QuizQuestion, { kind: "order" }>;
export type OrderItem = OrderQuestion["items"][number];

/** Parse + validate a raw deck (the JSON file). Throws with a readable list
 *  of issues, each with its path into the JSON. */
export function parseDeck(raw: unknown): Deck {
  const result = DeckSchema.safeParse(raw);
  if (result.success) return result.data;
  const lines = result.error.issues.map(
    (i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`
  );
  throw new Error(`Invalid deck:\n${lines.join("\n")}`);
}

/** Verdict for a score, shown on the results screen and share cards. */
export function verdictFor(deck: Deck, score: number, total: number): string {
  const ratio = total > 0 ? score / total : 0;
  if (ratio <= 0.3) return deck.verdicts.low;
  if (ratio <= 0.6) return deck.verdicts.mid;
  if (ratio < 1) return deck.verdicts.high;
  return deck.verdicts.perfect;
}

/** Pre-filled share post for the results screen: the score framed as a
 *  challenge, so every share invites the reader to play. The site link is
 *  appended separately (X's `url` intent param). */
export function shareTextFor(
  deck: Deck,
  level: QuizLevel,
  score: number
): string {
  const total = level.questions.length;
  const quiz = `${deck.title} quiz`;
  // Hidden tiers tease their existence without saying how to reach them.
  if (level.hidden) {
    return score === total
      ? `${score}/${total} on the hidden ${level.name} level of the ${quiz}. Yes, there's a hidden level.`
      : `I found the hidden ${level.name} level of the ${quiz} and scored ${score}/${total}. First, try finding it.`;
  }
  if (score === total)
    return `A perfect ${score}/${total} on the ${level.name} level of the ${quiz}. Your move.`;
  if (score >= deck.passScore)
    return `I scored ${score}/${total} on the ${level.name} level of the ${quiz} — can you beat me?`;
  return `I scored ${score}/${total} on the ${level.name} level of the ${quiz}. Harder than it looks.`;
}

/** JSON Schema (draft 2020-12) for a deck — the flashcard parameters as an
 *  external author or agent sees them. Refinements (unique ids, distinct
 *  options) aren't expressible here; parseDeck enforces them. */
export function deckJsonSchema(): Record<string, unknown> {
  const { $schema: _omit, ...schema } = z.toJSONSchema(DeckBaseSchema, {
    unrepresentable: "any",
  });
  void _omit;
  return schema;
}

/** Turn a plan plus written levels back into a valid deck. Levels keep the
 *  plan's order; a level without cards yet is left out, so a deck is
 *  playable as soon as its first level exists. */
export function assembleDeck(
  plan: DeckPlan,
  cards: Record<string, QuizQuestion[]>,
  slug: string = plan.slug
): Deck {
  const { levels: briefs, ...meta } = plan;
  const levels = briefs
    .filter((b) => cards[b.id]?.length)
    .map((b) => {
      const { focus: _focus, ...level } = b;
      void _focus;
      return { ...level, questions: cards[b.id] };
    });
  return parseDeck({ ...meta, slug, levels });
}
