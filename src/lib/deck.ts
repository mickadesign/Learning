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

/** Where a picture comes from, shown as a caption once the answer is
 *  revealed (never before: the title would give the answer away). */
export const ImageCreditSchema = z
  .object({
    title: z.string().min(1).describe("The work or subject, e.g. \"Las Meninas\""),
    author: z.string().min(1).describe("Artist or photographer"),
    license: z.string().min(1).describe("e.g. \"Public domain\", \"CC BY-SA 4.0\""),
    source: z.string().url().describe("Page the image came from"),
  })
  .partial();
export type ImageCredit = z.infer<typeof ImageCreditSchema>;

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
  imageAlt: z.string().optional().describe("What the picture shows, without naming the answer"),
  imageCredit: ImageCreditSchema.optional(),
});

export const TrueFalseQuestionSchema = z.object({
  kind: z.literal("truefalse"),
  ...QuestionBase,
  statement: z.string().min(1),
  answer: z.boolean(),
  revealImage: imagePath
    .optional()
    .describe("Shown blurred while answering, sharpened on the reveal"),
  imageAlt: z.string().optional().describe("What the picture shows, without naming the answer"),
  imageCredit: ImageCreditSchema.optional(),
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
    /** The big question on the landing page and the deck intro. */
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

// ── Authoring in steps (WebMCP) ─────────────────────────────
// An agent on the page writes a deck as a draft: metadata and level briefs
// first, then cards in batches, then publish. Drafts relax two things —
// levels may be empty and card ids are optional (assigned on add).

const withOptionalId = <T extends z.ZodRawShape>(shape: z.ZodObject<T>) =>
  shape.extend({ id: z.string().min(1).optional().describe("Optional; assigned if missing") });

/** A picture named rather than fetched: the exact Wikipedia article of the
 *  thing a card shows. The site (server or page) looks up that article's
 *  lead image, sets the slot, and fills in the credit — so an author never
 *  handles URLs. Dropped quietly when the article has no free image. */
export const PictureHintSchema = z.object({
  wikipediaTitle: z
    .string()
    .min(1)
    .describe("Exact English Wikipedia article title of the thing pictured"),
  slot: z
    .enum(["image", "revealImage"])
    .default("revealImage")
    .describe(
      "image: shown while answering (\"what is this?\" cards); revealImage: blurred until the answer (cards the picture would give away). Default revealImage."
    ),
  alt: z.string().min(1).describe("What the picture shows, without naming the answer"),
});
export type PictureHint = z.infer<typeof PictureHintSchema>;

/** A card as an author may send it: same as a question, id optional, and a
 *  `picture` hint in place of image fields on choice and truefalse cards. */
export const CardInputSchema = z.discriminatedUnion("kind", [
  withOptionalId(ChoiceQuestionSchema).extend({
    picture: PictureHintSchema.optional().describe(
      "Name the Wikipedia article of the thing pictured; the site fetches and credits the image"
    ),
  }),
  withOptionalId(TrueFalseQuestionSchema).extend({
    picture: PictureHintSchema.optional().describe(
      "Name the Wikipedia article of the thing pictured; shown blurred until the answer"
    ),
  }),
  withOptionalId(OrderQuestionSchema),
]);
export type CardInput = z.infer<typeof CardInputSchema>;

/** What starts a draft: the deck's metadata and its levels without cards. */
export const DeckStartSchema = DeckBaseSchema.omit({ levels: true, slug: true }).extend({
  slug: slug.optional().describe("Optional; derived from the title if missing"),
  levels: z
    .array(QuizLevelSchema.omit({ questions: true }))
    .min(1)
    .describe("In play order; each level unlocks the next"),
});
export type DeckStart = z.infer<typeof DeckStartSchema>;

/** A draft: a deck whose levels may still be empty. */
export const DraftSchema = DeckBaseSchema.extend({
  levels: z
    .array(QuizLevelSchema.extend({ questions: z.array(QuizQuestionSchema).default([]) }))
    .min(1),
});
export type Draft = z.infer<typeof DraftSchema>;

/** One card of each kind, for anyone learning the format. */
export const EXAMPLE_CARDS: QuizQuestion[] = [
  {
    kind: "choice",
    id: "example-1",
    prompt: "Who painted the Mona Lisa?",
    options: ["Leonardo da Vinci", "Michelangelo", "Sandro Botticelli", "Caravaggio"],
    fact: "The Mona Lisa is a Renaissance work — a period defined by realism, proportion, and perspective.",
  },
  {
    kind: "truefalse",
    id: "example-2",
    statement: "Realism aimed to idealize its subjects.",
    answer: false,
    fact: "Realism (1840 – 1880) portrayed the world as it is — everyday subjects, with idealism avoided.",
  },
  {
    kind: "choice",
    id: "example-4",
    prompt: "Who painted Las Meninas?",
    revealImage:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Las_Meninas,_by_Diego_Vel%C3%A1zquez,_from_Prado_in_Google_Earth.jpg?width=800",
    imageAlt: "A Baroque court scene: a young princess with her attendants, a painter at his easel.",
    imageCredit: {
      title: "Las Meninas",
      author: "Diego Velázquez",
      license: "Public domain",
      source: "https://en.wikipedia.org/wiki/Las_Meninas",
    },
    options: ["Diego Velázquez", "Caravaggio", "Peter Paul Rubens", "Jacques-Louis David"],
    fact: "Velázquez's Las Meninas is a Baroque work (1600 – 1700).",
  },
  {
    kind: "order",
    id: "example-3",
    prompt: "Tap these movements in order, earliest first.",
    items: [
      { label: "Renaissance", value: 1400 },
      { label: "Baroque", value: 1600 },
      { label: "Impressionism", value: 1860 },
    ],
    fact: "Renaissance (1400 – 1600), then Baroque (1600 – 1700), then Impressionism (1860 – 1880).",
  },
];

/** The rules the site enforces, in one place for tools and docs. */
export const AUTHORING_RULES = [
  "options[0] is the correct answer; the site shuffles options, you must not.",
  "options has 2 to 6 entries (4 is the sweet spot); order items has 3 to 5, listed lowest value first.",
  "Every card has a fact: one line shown after answering, right or wrong, that adds something.",
  "Question ids are unique across the deck (omit them when adding cards and they are assigned).",
  "passScore can't exceed a level's card count; the reference deck uses 10 cards per level and passes at 7.",
  "Pictures: for a card about something you can look at (a work, a building, a species, an object, a place), set picture: { wikipediaTitle, slot, alt } with the exact English Wikipedia article title of the thing pictured; the site fetches that article's lead image and credits it. slot \"image\" shows sharp while answering (\"what is this?\" cards); \"revealImage\" stays blurred until the answer (\"who made X?\" cards, so the picture can't spoil it). alt describes the picture without naming the answer. To pick a specific file instead, find_flashcard_images returns licensed candidates with a ready credit for image/revealImage + imageCredit. Never invent an image URL.",
  "Level ids and the deck slug are lowercase letters, digits and dashes.",
];

/** House style, condensed from prompts/new-deck.md for agents on the page. */
export const HOUSE_STYLE = [
  "Levels ramp: famous basics → relationships and why → exact numbers and deep cuts (timed) → a hidden last level on a 10-second clock mixing every trick.",
  "Ten cards per level, mixing kinds: about six choice, two truefalse, one or two order.",
  "Distractors are plausible and from the same domain; no 'all of the above', no jokes as options.",
  "About half the true/false statements are false, and a false one is a common misconception, not nonsense.",
  "Tone: warm, precise, a little playful; second person; no exclamation marks in prompts. Verdicts are flavoured by the topic.",
  "Facts must be true; prefer well-established facts over disputed trivia.",
];

/** A URL-safe slug from free text. */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/, "") || "deck"
  );
}

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
