"use client";

// WebMCP: the page registers its flashcard actions as tools on
// document.modelContext, so an agent in the browser (Chromium's WebMCP, the
// MCP-B extension, or anything else speaking the API) can read the format,
// write a deck in steps, import one it wrote elsewhere, have the site's AI
// write one, and play. The human-readable reference is /agents.md.
//
// `@mcp-b/global` wraps the native API when the browser has it and installs
// a polyfill otherwise, so the tools exist everywhere; it is loaded lazily
// because it only means anything in a browser.

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { CallToolResult, ModelContext } from "@mcp-b/webmcp-types";
import { z } from "zod";
import {
  AUTHORING_RULES,
  CardInputSchema,
  DeckStartSchema,
  EXAMPLE_CARDS,
  HOUSE_STYLE,
  PictureHintSchema,
  deckJsonSchema,
  parseDeck,
  slugify,
  type CardInput,
  type Deck,
  type Draft,
  type QuizQuestion,
} from "./deck";
import { attachPicture, creditFor, findImages } from "./image-search";
import {
  getDraft,
  listDrafts,
  removeDeck,
  removeDraft,
  saveDeck,
  saveDraft,
  uniqueSlug,
} from "./deck-store";

declare global {
  interface Window {
    /** A plain-JavaScript door to the same tools, for agents whose browser
     *  can only run page scripts: `window.flashcards.call(name, args)`. */
    flashcards?: {
      call: (name: string, args?: Record<string, unknown>) => Promise<CallToolResult>;
      tools: () => { name: string; title: string; description: string; inputSchema: Record<string, unknown> }[];
    };
  }
}

export interface DeckSummary {
  slug: string;
  title: string;
  headline: string;
  builtIn: boolean;
  levels: {
    id: string;
    name: string;
    cards: number;
    timed: boolean;
    hidden: boolean;
    best?: number;
  }[];
}

/** What the page lends the tools: the parts that touch React state. */
export interface FlashcardToolHandlers {
  /** Have the server's AI plan and write a deck; resolves when the first
   *  level is playable and the quiz is open (the rest keep arriving). */
  generateDeck: (topic: string, notes?: string) => Promise<Deck>;
  /** Open the quiz on a deck. */
  openDeck: (deck: Deck) => void;
  /** Open the quiz for a slug (the built-in deck when omitted). */
  playDeck: (slug?: string) => Deck;
  /** Playable decks: built-in plus saved, with best scores. */
  listDecks: () => DeckSummary[];
  /** A playable deck by slug. */
  findDeck: (slug: string) => Deck | undefined;
  /** Remove a saved deck (never the built-in one). */
  deleteDeck: (slug: string) => void;
}

// ── Result helpers ──────────────────────────────────────────

function text(t: string, structured?: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: t }],
    ...(structured ? { structuredContent: structured } : {}),
  };
}

function summaryLine(d: DeckSummary): string {
  const levels = d.levels
    .map(
      (l) =>
        `${l.name} [${l.id}] (${l.cards} cards${l.timed ? ", timed" : ""}${l.hidden ? ", hidden" : ""}${l.best !== undefined ? `, best ${l.best}` : ""})`
    )
    .join(", ");
  return `${d.slug}: "${d.title}" — ${d.headline} Levels: ${levels}.`;
}

function draftLine(d: Draft): string {
  const levels = d.levels
    .map((l) => `${l.name} [${l.id}] ${l.questions.length} cards`)
    .join(", ");
  return `${d.slug} (draft): "${d.title}" — ${levels}.`;
}

function kindCounts(questions: QuizQuestion[]) {
  const counts = { choice: 0, truefalse: 0, order: 0 };
  for (const q of questions) counts[q.kind]++;
  return counts;
}

/** Cards that could carry a picture but don't — choice and truefalse cards
 *  with neither slot filled. Order cards take no picture. */
function withoutPicture(questions: QuizQuestion[]): number {
  return questions.filter(
    (q) => q.kind !== "order" && !("image" in q && q.image) && !q.revealImage
  ).length;
}

/** Resolve `picture` hints inside a raw, not-yet-validated deck (the import
 *  path), leaving everything else for parseDeck to judge. */
async function resolveRawPictures(raw: unknown): Promise<{ deck: unknown; missing: string[] }> {
  const missing: string[] = [];
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { levels?: unknown }).levels))
    return { deck: raw, missing };
  const levels = await Promise.all(
    ((raw as { levels: unknown[] }).levels).map(async (level) => {
      if (!level || typeof level !== "object" || !Array.isArray((level as { questions?: unknown }).questions))
        return level;
      const questions = await Promise.all(
        ((level as { questions: unknown[] }).questions).map(async (q) => {
          if (!q || typeof q !== "object" || !("picture" in q)) return q;
          const hint = PictureHintSchema.safeParse((q as { picture: unknown }).picture);
          if (!hint.success) return q;
          const { card, found } = await attachPicture({
            ...(q as unknown as { kind: string }),
            picture: hint.data,
          });
          if (!found) missing.push(hint.data.wikipediaTitle);
          return card;
        })
      );
      return { ...level, questions };
    })
  );
  return { deck: { ...(raw as object), levels }, missing };
}

/** What a draft still needs before it can be published. */
function draftGaps(d: Draft): string[] {
  return d.levels.flatMap((l) => {
    if (l.questions.length === 0) return [`"${l.id}" has no cards yet`];
    if (l.questions.length < d.passScore)
      return [`"${l.id}" has ${l.questions.length} cards but passScore is ${d.passScore}`];
    return [];
  });
}

function takenSlugs(h: FlashcardToolHandlers): string[] {
  return [...h.listDecks().map((d) => d.slug), ...listDrafts().map((d) => d.slug)];
}

/** Zod issues as one readable message. */
function issues(error: z.ZodError): string {
  return error.issues
    .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
}

// ── Tool definitions ────────────────────────────────────────

interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly?: boolean;
  execute: (input: unknown) => Promise<CallToolResult>;
}

// ── Agent presence ──────────────────────────────────────────
// The page's only window into an agent at work is the tool calls it makes.
// Each call is noted here so the home screen can acknowledge it ("your
// agent is writing cards…") instead of sitting still until the quiz opens.

export type AgentActivity =
  | { phase: "idle" }
  /** `title` is the draft being written, once a call has named it. */
  | { phase: "working"; tool: string; at: number; title?: string }
  | { phase: "done"; deck: Deck; at: number };

const IDLE: AgentActivity = { phase: "idle" };
let activity: AgentActivity = IDLE;
const activityListeners = new Set<() => void>();

function setActivity(next: AgentActivity) {
  activity = next;
  activityListeners.forEach((l) => l());
}

function subscribeActivity(listener: () => void) {
  activityListeners.add(listener);
  return () => {
    activityListeners.delete(listener);
  };
}

/** What the agent on this page is doing, as of its last tool call. */
export function useAgentActivity(): AgentActivity {
  return useSyncExternalStore(subscribeActivity, () => activity, () => IDLE);
}

/** A call is under way. The draft's title sticks from call to call once a
 *  tool has named it; tools that hold the draft pass it in, so a reload
 *  between calls picks it up again. */
function noteWorking(tool: string, title?: string) {
  setActivity({
    phase: "working",
    tool,
    at: Date.now(),
    title: title ?? (activity.phase === "working" ? activity.title : undefined),
  });
}

/** Note a call before the tool runs. Publish and import mark the deck done
 *  themselves, once it is saved. */
function withActivity(def: ToolDef): ToolDef {
  return {
    ...def,
    async execute(input) {
      noteWorking(def.name);
      return def.execute(input);
    },
  };
}

const SlugInput = z.object({ slug: z.string().min(1) });
const AddCardsInput = z.object({
  slug: z.string().min(1),
  level: z.string().min(1),
  cards: z.array(CardInputSchema).min(1),
});
const PublishInput = z.object({
  slug: z.string().min(1),
  open: z.boolean().default(true),
});
const ImportInput = z.object({
  deck: z.unknown(),
  replace: z.boolean().default(false),
});
const GenerateInput = z.object({
  topic: z.string().trim().min(2).max(120),
  notes: z.string().max(2000).optional(),
});
const PlayInput = z.object({ slug: z.string().min(1).optional() });
const FormatInput = z.object({
  section: z.enum(["guide", "examples", "schema", "all"]).default("guide"),
});
const FindImagesInput = z.object({
  query: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200).optional(),
  limit: z.number().int().min(1).max(10).default(5),
});

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _omit, ...rest } = z.toJSONSchema(schema, { unrepresentable: "any" });
  void _omit;
  return rest;
}

const WORKFLOW = [
  "1. get_flashcard_format — this guide; ask for section \"examples\" (one card of each kind) or \"schema\" (the deck JSON Schema) when you need them.",
  "2. start_flashcard_deck — title, headline (a question), tagline, verdicts, and the levels (usually four: three open, the last hidden and timed).",
  "3. add_flashcards — about ten cards per level, in one or more batches; ids are assigned for you. For a card about something you can look at, add picture: { wikipediaTitle, slot, alt } and the site fetches and credits the picture itself (find_flashcard_images only when you want to pick a specific file).",
  "4. publish_flashcard_deck — validates, saves the deck in this browser, and opens the quiz.",
  "Or: import_flashcards with a complete deck; or generate_flashcards to have the site's own AI write one (needs the server to have a key).",
];

function tools(h: () => FlashcardToolHandlers): ToolDef[] {
  return [
    {
      name: "get_flashcard_format",
      title: "Flashcard format and authoring guide",
      description:
        "Read this first. Short by default (about 3 KB): the workflow for writing a deck on this site, the rules the site enforces, and the house style. Ask for section \"examples\" (one card of each kind — choice, truefalse, order, and one with a picture) or \"schema\" (the deck JSON Schema) when you need them, or \"all\".",
      inputSchema: {
        type: "object",
        properties: {
          section: {
            type: "string",
            enum: ["guide", "examples", "schema", "all"],
            description: "What to return. Default \"guide\".",
          },
        },
      },
      readOnly: true,
      async execute(input) {
        const { section } = FormatInput.parse(input ?? {});
        const guide = [
          "Workflow:",
          ...WORKFLOW.map((w) => `  ${w}`),
          "",
          "Rules:",
          ...AUTHORING_RULES.map((r) => `  - ${r}`),
          "",
          "House style:",
          ...HOUSE_STYLE.map((r) => `  - ${r}`),
        ];
        const examples = ["Example cards:", JSON.stringify(EXAMPLE_CARDS, null, 2)];
        const schema = () => ["Deck JSON Schema:", JSON.stringify(deckJsonSchema(), null, 2)];
        switch (section) {
          case "examples":
            return text(examples.join("\n"), { examples: EXAMPLE_CARDS });
          case "schema":
            return text(schema().join("\n"), { schema: deckJsonSchema() });
          case "all":
            return text([...guide, "", ...examples, "", ...schema()].join("\n"), {
              workflow: WORKFLOW,
              rules: AUTHORING_RULES,
              houseStyle: HOUSE_STYLE,
              examples: EXAMPLE_CARDS,
              schema: deckJsonSchema(),
            });
          default:
            return text(
              [...guide, "", 'More: section "examples" for one card of each kind, "schema" for the deck JSON Schema.'].join("\n"),
              { workflow: WORKFLOW, rules: AUTHORING_RULES, houseStyle: HOUSE_STYLE, sections: ["examples", "schema", "all"] }
            );
        }
      },
    },

    {
      name: "find_flashcard_images",
      title: "Find a picture for a card",
      description:
        "Licensed pictures for a card, from Wikipedia and Wikimedia Commons. Give the exact English Wikipedia article title of the thing when you know it (\"Las Meninas\", \"Hario V60\") and a search query otherwise. Returns up to five candidates with a URL sized for the card, the source page, author and license, and a ready-made credit. Put the URL in image (shown while answering — \"what is this?\" cards) or revealImage (blurred until the answer — \"who made X?\" cards), describe it in imageAlt without naming the answer, and copy credit into imageCredit. Never invent image URLs.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "What to look for, e.g. \"Bayeux Tapestry\" or \"V60 pour-over dripper\".",
          },
          title: {
            type: "string",
            description: "Exact English Wikipedia article title, when known — its lead image comes first.",
          },
          limit: { type: "integer", description: "At most this many candidates (1–10). Default 5." },
        },
        required: ["query"],
      },
      readOnly: true,
      async execute(input) {
        const { query, title, limit } = FindImagesInput.parse(input);
        const found = await findImages(query, { title, limit });
        if (!found.length)
          return text(
            `No reusable image found for "${query}". Try the exact Wikipedia title of the subject (title), a different query, or leave the card without a picture.`,
            { candidates: [] }
          );
        const candidates = found.map((c) => ({ ...c, credit: creditFor(c) }));
        const lines = candidates.map(
          (c, i) =>
            `${i + 1}. ${c.title}${c.author ? ` — ${c.author}` : ""} · ${c.license ?? "license unknown"} (${c.origin})\n   url: ${c.url}\n   source: ${c.source}`
        );
        return text(lines.join("\n"), { candidates });
      },
    },

    {
      name: "list_flashcard_decks",
      title: "List decks",
      description:
        "The decks on this page: the built-in one and the decks saved in this browser (with levels, card counts, and the visitor's best scores), plus any drafts still being written.",
      inputSchema: { type: "object", properties: {} },
      readOnly: true,
      async execute() {
        const decks = h().listDecks();
        const drafts = listDrafts();
        const lines = [...decks.map(summaryLine), ...drafts.map(draftLine)];
        return text(lines.join("\n"), {
          decks,
          drafts: drafts.map((d) => ({
            slug: d.slug,
            title: d.title,
            levels: d.levels.map((l) => ({ id: l.id, name: l.name, cards: l.questions.length })),
          })),
        });
      },
    },

    {
      name: "get_flashcard_deck",
      title: "Read a deck",
      description:
        "The full JSON of a deck or draft by slug: every level and card. Use it to review what was written, or as a starting point for a new deck.",
      inputSchema: {
        type: "object",
        properties: { slug: { type: "string", description: "From list_flashcard_decks." } },
        required: ["slug"],
      },
      readOnly: true,
      async execute(input) {
        const { slug } = SlugInput.parse(input);
        const deck = h().findDeck(slug);
        if (deck) {
          const status = h().listDecks().find((d) => d.slug === slug)?.builtIn ? "built-in" : "saved";
          return text(JSON.stringify(deck, null, 2), { status, deck });
        }
        const draft = getDraft(slug);
        if (draft) return text(JSON.stringify(draft, null, 2), { status: "draft", deck: draft });
        throw new Error(`No deck or draft "${slug}". Try list_flashcard_decks.`);
      },
    },

    {
      name: "start_flashcard_deck",
      title: "Start a deck",
      description:
        "Begin writing a deck: give its title, headline (phrased as a question, e.g. \"Are you a coffee nerd?\"), tagline, verdicts for four score bands, and its levels without cards (id, name, tagline; timed and hidden are optional). Returns the draft's slug. Then call add_flashcards for each level and publish_flashcard_deck when every level has its cards.",
      inputSchema: jsonSchema(DeckStartSchema),
      async execute(input) {
        const parsed = DeckStartSchema.safeParse(input);
        if (!parsed.success) throw new Error(`Invalid deck:\n${issues(parsed.error)}`);
        const start = parsed.data;
        const slug = uniqueSlug(start.slug ?? slugify(start.title), takenSlugs(h()));
        const draft: Draft = {
          ...start,
          slug,
          levels: start.levels.map((l) => ({ ...l, questions: [] })),
        };
        saveDraft(draft);
        noteWorking("start_flashcard_deck", draft.title);
        const levels = draft.levels.map((l) => `"${l.id}" (${l.name})`).join(", ");
        return text(
          `Draft "${draft.title}" started as ${slug} with levels ${levels}. Next: add_flashcards for each level — about 10 cards each, mixing choice, truefalse and order — then publish_flashcard_deck. passScore is ${draft.passScore}, so every level needs at least that many cards.`,
          { slug, levels: draft.levels.map((l) => l.id), passScore: draft.passScore }
        );
      },
    },

    {
      name: "add_flashcards",
      title: "Add cards to a draft",
      description:
        "Append cards to one level of a draft started with start_flashcard_deck. Send any number per call (a whole level of ten, or a few at a time). Each card is a choice (options[0] correct), truefalse, or order card with a one-line fact; ids are assigned when omitted. For a card about something you can look at, add picture: { wikipediaTitle, slot, alt } — the site fetches that Wikipedia article's lead image and credits it, no URL needed. Returns the level's counts, which pictures were attached, and what the draft still needs.",
      inputSchema: jsonSchema(AddCardsInput),
      async execute(input) {
        const parsed = AddCardsInput.safeParse(input);
        if (!parsed.success) throw new Error(`Invalid cards:\n${issues(parsed.error)}`);
        const { slug, level: levelId, cards } = parsed.data;
        const draft = getDraft(slug);
        if (!draft)
          throw new Error(
            `No draft "${slug}". Start one with start_flashcard_deck (list_flashcard_decks shows drafts).`
          );
        const level = draft.levels.find((l) => l.id === levelId);
        if (!level)
          throw new Error(
            `No level "${levelId}" in draft ${slug}. Levels: ${draft.levels.map((l) => l.id).join(", ")}.`
          );
        noteWorking("add_flashcards", draft.title);
        const taken = new Set(draft.levels.flatMap((l) => l.questions.map((q) => q.id)));
        let n = level.questions.length;
        const added: (CardInput & { id: string })[] = [];
        const problems: string[] = [];
        cards.forEach((card, i) => {
          if (card.kind === "choice" && new Set(card.options).size !== card.options.length)
            problems.push(`cards.${i}: options must be distinct`);
          if (card.kind === "order") {
            if (new Set(card.items.map((it) => it.value)).size !== card.items.length)
              problems.push(`cards.${i}: order items need distinct values`);
            if (new Set(card.items.map((it) => it.label)).size !== card.items.length)
              problems.push(`cards.${i}: order items need distinct labels`);
          }
          let id = card.id;
          if (id && taken.has(id)) problems.push(`cards.${i}: id "${id}" is already used in this deck`);
          if (!id) {
            do id = `${levelId}-${++n}`;
            while (taken.has(id));
          }
          taken.add(id);
          added.push({ ...card, id } as CardInput & { id: string });
        });
        if (problems.length) throw new Error(`Nothing added:\n${problems.map((p) => `  ${p}`).join("\n")}`);
        // Picture hints become real, credited images here — one lookup per
        // hinted card, all in flight together. A hint whose article has no
        // free image is dropped and named in the result.
        const attached: string[] = [];
        const missing: string[] = [];
        const resolved = await Promise.all(
          added.map(async (card) => {
            if (card.kind === "order" || !card.picture) {
              const { picture: _drop, ...rest } = card as typeof card & { picture?: unknown };
              void _drop;
              return rest as QuizQuestion;
            }
            const hint = card.picture;
            const { card: withPicture, found } = await attachPicture(card);
            (found ? attached : missing).push(found ? withPicture.id : hint.wikipediaTitle);
            return withPicture as QuizQuestion;
          })
        );
        level.questions.push(...resolved);
        saveDraft(draft);
        const counts = kindCounts(level.questions);
        const gaps = draftGaps(draft);
        const bare = withoutPicture(level.questions);
        const pictureNotes = [
          attached.length ? `${attached.length} with a picture` : "",
          missing.length
            ? `no free image for ${missing.map((t) => `"${t}"`).join(", ")} (try find_flashcard_images or another article)`
            : "",
          bare ? `${bare} ${bare === 1 ? "card" : "cards"} in this level still ${bare === 1 ? "has" : "have"} no picture — add picture: { wikipediaTitle, slot, alt } where there's something to look at` : "",
        ].filter(Boolean);
        return text(
          `Added ${resolved.length} ${resolved.length === 1 ? "card" : "cards"} to "${levelId}"; it now has ${level.questions.length} (${counts.choice} choice, ${counts.truefalse} truefalse, ${counts.order} order). ${
            gaps.length
              ? `Still needed: ${gaps.join("; ")}.`
              : "Every level has enough cards — publish_flashcard_deck when you're done."
          }${pictureNotes.length ? ` Pictures: ${pictureNotes.join("; ")}.` : ""}`,
          {
            slug,
            level: levelId,
            added: resolved.map((q) => q.id),
            levels: draft.levels.map((l) => ({ id: l.id, cards: l.questions.length })),
            gaps,
            pictures: { attached, missing, withoutPicture: bare },
          }
        );
      },
    },

    {
      name: "publish_flashcard_deck",
      title: "Publish a draft",
      description:
        "Validate a draft, save it as a playable deck in this browser, and open the quiz on it (open: false to just save). Errors name what is missing or wrong, by JSON path.",
      inputSchema: {
        type: "object",
        properties: {
          slug: { type: "string", description: "The draft's slug from start_flashcard_deck." },
          open: { type: "boolean", description: "Open the quiz after saving. Default true." },
        },
        required: ["slug"],
      },
      async execute(input) {
        const { slug, open } = PublishInput.parse(input);
        const draft = getDraft(slug);
        if (!draft) throw new Error(`No draft "${slug}". list_flashcard_decks shows drafts.`);
        noteWorking("publish_flashcard_deck", draft.title);
        const gaps = draftGaps(draft);
        if (gaps.length) throw new Error(`Not ready to publish: ${gaps.join("; ")}.`);
        const deck = parseDeck(draft);
        saveDeck(deck);
        removeDraft(slug);
        if (open) h().openDeck(deck);
        setActivity({ phase: "done", deck, at: Date.now() });
        const total = deck.levels.reduce((sum, l) => sum + l.questions.length, 0);
        return text(
          `Published "${deck.title}" (${slug}): ${deck.levels.length} levels, ${total} cards.${open ? " The quiz is open on it." : ""}`,
          { slug, title: deck.title, levels: deck.levels.length, cards: total }
        );
      },
    },

    {
      name: "import_flashcards",
      title: "Import a complete deck",
      description:
        "Save a complete deck in one call (the JSON Schema from get_flashcard_format) and open it. If a saved deck already uses the slug, a new slug is chosen unless replace is true. For writing a deck in steps, use start_flashcard_deck instead.",
      inputSchema: {
        type: "object",
        properties: {
          deck: deckJsonSchema(),
          replace: {
            type: "boolean",
            description: "Overwrite a saved deck with the same slug. Default false.",
          },
        },
        required: ["deck"],
      },
      async execute(input) {
        const { deck: rawInput, replace } = ImportInput.parse(input);
        const { deck: raw, missing } = await resolveRawPictures(rawInput);
        const parsed = parseDeck(raw);
        const existing = h().findDeck(parsed.slug);
        const builtIn = h().listDecks().find((d) => d.slug === parsed.slug)?.builtIn;
        const slug =
          replace && existing && !builtIn ? parsed.slug : uniqueSlug(parsed.slug, takenSlugs(h()));
        const deck = { ...parsed, slug };
        saveDeck(deck);
        h().openDeck(deck);
        setActivity({ phase: "done", deck, at: Date.now() });
        return text(
          `Imported and opened "${deck.title}" (${slug}).${
            missing.length ? ` No free image for ${missing.map((t) => `"${t}"`).join(", ")}; those cards have no picture.` : ""
          }`,
          { slug, title: deck.title, pictures: { missing } }
        );
      },
    },

    {
      name: "generate_flashcards",
      title: "Have the site write a deck",
      description:
        "Ask the site's own AI (Claude, on the server) to plan and write a deck about a topic, then open it: the first level is ready in under a minute and the quiz opens on it; the rest are written in the background. Only works when the deployment has a key — if it doesn't, write the deck yourself with start_flashcard_deck, add_flashcards and publish_flashcard_deck.",
      inputSchema: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description: 'What the visitor wants to learn, e.g. "The French Revolution" or "Coffee brewing".',
          },
          notes: {
            type: "string",
            description: "Optional guidance: angle, difficulty, audience, images to use.",
          },
        },
        required: ["topic"],
      },
      async execute(input) {
        const { topic, notes } = GenerateInput.parse(input);
        try {
          const deck = await h().generateDeck(topic, notes);
          return text(
            `Deck "${deck.title}" (${deck.slug}) is open on its first level, "${deck.levels[0].name}". The remaining levels are being written now.`,
            { slug: deck.slug, title: deck.title, headline: deck.headline }
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(
            /isn't set up|unavailable/i.test(message)
              ? `${message} You can still write the deck yourself: start_flashcard_deck, then add_flashcards per level, then publish_flashcard_deck.`
              : message
          );
        }
      },
    },

    {
      name: "play_flashcards",
      title: "Play a deck",
      description:
        "Open the quiz for a deck. Omit the slug for the built-in deck; list_flashcard_decks shows the others. The visitor then plays: levels unlock in order by reaching passScore.",
      inputSchema: {
        type: "object",
        properties: { slug: { type: "string", description: "A deck slug from list_flashcard_decks." } },
      },
      async execute(input) {
        const { slug } = PlayInput.parse(input ?? {});
        const deck = h().playDeck(slug);
        return text(`Opened "${deck.title}" — ${deck.headline}`, { slug: deck.slug });
      },
    },

    {
      name: "delete_flashcard_deck",
      title: "Delete a deck or draft",
      description:
        "Remove a saved deck or a draft from this browser. The built-in deck can't be deleted. Best scores for the deck are kept out of the way but not erased.",
      inputSchema: {
        type: "object",
        properties: { slug: { type: "string" } },
        required: ["slug"],
      },
      async execute(input) {
        const { slug } = SlugInput.parse(input);
        if (getDraft(slug)) {
          removeDraft(slug);
          return text(`Deleted draft ${slug}.`, { slug, was: "draft" });
        }
        const summary = h().listDecks().find((d) => d.slug === slug);
        if (!summary) throw new Error(`No deck or draft "${slug}".`);
        if (summary.builtIn) throw new Error(`"${slug}" is the built-in deck and can't be deleted.`);
        h().deleteDeck(slug);
        removeDeck(slug);
        return text(`Deleted deck "${summary.title}" (${slug}).`, { slug, was: "deck" });
      },
    },
  ];
}

// ── Registration ────────────────────────────────────────────

type RegisterArg = Parameters<ModelContext["registerTool"]>[0];

/** `window.flashcards`: the same tools, callable by name from any page
 *  script, returning plain objects. For agents whose browser has no WebMCP
 *  host and drives the page with a script tool — the polyfill's
 *  executeTool needs the live RegisteredTool object from getTools(), which
 *  can't be serialized or rebuilt by hand, and that trips them up. */
function installPageHelper(defs: ToolDef[]) {
  const byName = new Map(defs.map((t) => [t.name, t]));
  window.flashcards = {
    async call(name, args = {}) {
      const tool = byName.get(name);
      if (!tool)
        throw new Error(`No tool "${name}". Tools: ${[...byName.keys()].join(", ")}.`);
      return tool.execute(args);
    },
    tools: () =>
      defs.map(({ name, title, description, inputSchema }) => ({ name, title, description, inputSchema })),
  };
  return () => {
    if (window.flashcards?.call) delete window.flashcards;
  };
}

async function register(ctx: ModelContext, defs: ToolDef[], signal: AbortSignal) {
  for (const tool of defs) {
    const def = {
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      ...(tool.readOnly ? { annotations: { readOnlyHint: true } } : {}),
      execute: tool.execute,
    };
    // Schemas are built at runtime (several derive from the zod deck
    // schema), so the literal-inferring overloads can't type them — cast.
    await ctx.registerTool(def as unknown as RegisterArg, { signal });
  }
}

/** Register the flashcard tools for the page's lifetime. Handlers are read
 *  through a ref, so the latest React state is always the one acting. */
export function useWebMcpTools(handlers: FlashcardToolHandlers) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const defs = tools(() => ref.current).map(withActivity);
    // The page helper first: it needs nothing loaded and works even if the
    // WebMCP runtime fails to.
    const uninstall = installPageHelper(defs);
    (async () => {
      await import("@mcp-b/global");
      const ctx = document.modelContext;
      if (!ctx || cancelled) return;
      await register(ctx, defs, controller.signal);
    })().catch((error) => {
      console.warn("WebMCP tools not registered:", error);
    });
    return () => {
      cancelled = true;
      controller.abort();
      uninstall();
    };
  }, []);
}
