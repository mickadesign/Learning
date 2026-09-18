"use client";

// WebMCP: the page registers its flashcard actions as tools on
// document.modelContext, so an agent in the browser (Chromium's WebMCP,
// the MCP-B extension, or anything else speaking the API) can list decks,
// make a new one from a topic, import cards it wrote itself, and play.
//
// `@mcp-b/global` wraps the native API when the browser has it and installs
// a polyfill otherwise, so the tools exist everywhere; it is loaded lazily
// because it only means anything in a browser.

import { useEffect, useRef } from "react";
import type { CallToolResult, ModelContext } from "@mcp-b/webmcp-types";
import { deckJsonSchema, type Deck } from "./deck";

export interface DeckSummary {
  slug: string;
  title: string;
  headline: string;
  builtIn: boolean;
  levels: { id: string; name: string; cards: number; timed: boolean; hidden: boolean; best?: number }[];
}

export interface FlashcardToolHandlers {
  /** Plan and write a deck; resolves when the first level is playable and
   *  the quiz is open (remaining levels keep arriving). */
  createDeck: (topic: string, notes?: string) => Promise<Deck>;
  /** Open the quiz for a deck (the built-in one when no slug is given). */
  playDeck: (slug?: string) => Deck;
  listDecks: () => DeckSummary[];
  /** Validate a deck someone else wrote, save it, and open it. */
  importDeck: (raw: unknown) => Deck;
}

function text(t: string, structured?: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: t }],
    ...(structured ? { structuredContent: structured } : {}),
  };
}

function summaryLine(d: DeckSummary): string {
  const levels = d.levels
    .map((l) => `${l.name} (${l.cards} cards${l.best !== undefined ? `, best ${l.best}` : ""})`)
    .join(", ");
  return `${d.slug}: "${d.title}" — ${d.headline} Levels: ${levels}.`;
}

async function register(ctx: ModelContext, h: () => FlashcardToolHandlers, signal: AbortSignal) {
  await ctx.registerTool(
    {
      name: "list_flashcard_decks",
      description:
        "List the flashcard decks available on this page: the built-in one and the decks saved in this browser, with their levels and the visitor's best scores.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      async execute() {
        const decks = h().listDecks();
        return text(decks.map(summaryLine).join("\n"), { decks });
      },
    },
    { signal }
  );

  await ctx.registerTool(
    {
      name: "create_flashcards",
      description:
        "Write a new flashcard deck about a topic with AI and open it. Four levels of ten cards: the first level is ready in under a minute and the quiz opens on it; the rest are written in the background. Save the returned slug to play it again later.",
      inputSchema: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description: "What the visitor wants to learn, e.g. \"The French Revolution\" or \"Coffee brewing\".",
          },
          notes: {
            type: "string",
            description: "Optional guidance: angle, difficulty, audience, images to use.",
          },
        },
        required: ["topic"],
      },
      async execute({ topic, notes }) {
        const deck = await h().createDeck(topic, notes);
        return text(
          `Deck "${deck.title}" (${deck.slug}) is open on its first level, "${deck.levels[0].name}". The remaining levels are being written now.`,
          { slug: deck.slug, title: deck.title, headline: deck.headline }
        );
      },
    },
    { signal }
  );

  await ctx.registerTool(
    {
      name: "play_flashcards",
      description:
        "Open the quiz for a deck. Omit the slug for the built-in deck; use list_flashcard_decks to see the others.",
      inputSchema: {
        type: "object",
        properties: {
          slug: { type: "string", description: "A deck slug from list_flashcard_decks." },
        },
      },
      async execute({ slug }) {
        const deck = h().playDeck(slug);
        return text(`Opened "${deck.title}" — ${deck.headline}`, { slug: deck.slug });
      },
    },
    { signal }
  );

  await ctx.registerTool(
    {
      name: "get_flashcard_format",
      description:
        "The parameters of a flashcard deck as a JSON Schema — question kinds (choice, truefalse, order), the correct answer, the fact revealed after answering, optional pictures — plus the rules the site enforces. Read this before import_flashcards.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      async execute() {
        const schema = deckJsonSchema();
        const rules = [
          "options[0] is the correct answer; the site shuffles options.",
          "Question ids are unique across the deck; level ids are unique.",
          "order items are listed lowest value first; the site shuffles them.",
          "passScore can't exceed a level's card count.",
          "image shows sharp while answering; revealImage shows blurred and sharpens with the answer. Only use images you know exist.",
        ];
        return text(
          `Deck JSON Schema:\n${JSON.stringify(schema, null, 2)}\n\nRules:\n${rules.map((r) => `- ${r}`).join("\n")}`,
          { schema, rules }
        );
      },
    },
    { signal }
  );

  // The import tool's schema is the deck schema itself, derived at runtime,
  // so it can't be a literal the type inference reads — cast once.
  await ctx.registerTool(
    {
      name: "import_flashcards",
      description:
        "Save a flashcard deck you wrote yourself (see get_flashcard_format) into this browser and open it. The deck is validated first; errors come back with the JSON path of each problem.",
      inputSchema: {
        type: "object",
        properties: { deck: deckJsonSchema() },
        required: ["deck"],
      },
      async execute(input: { deck: unknown }) {
        const deck = h().importDeck(input.deck);
        return text(`Imported and opened "${deck.title}" (${deck.slug}).`, {
          slug: deck.slug,
          title: deck.title,
        });
      },
    } as unknown as Parameters<ModelContext["registerTool"]>[0],
    { signal }
  );
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
    (async () => {
      await import("@mcp-b/global");
      const ctx = document.modelContext;
      if (!ctx || cancelled) return;
      await register(ctx, () => ref.current, controller.signal);
    })().catch((error) => {
      console.warn("WebMCP tools not registered:", error);
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);
}
