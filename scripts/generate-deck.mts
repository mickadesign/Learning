// Generate a deck with Claude and write it to src/data/deck.json.
//
//   npm run generate -- "The French Revolution"
//   npm run generate -- "Coffee brewing" --notes "Images available: /images/v60.jpg (a V60 dripper)"
//   npm run generate -- "Chess openings" --out decks/chess.json
//
// Needs ANTHROPIC_API_KEY in the environment (or a .env file, see
// .env.example). The brief the model follows is prompts/new-deck.md — edit it
// to change the house style.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { DeckSchema, parseDeck } from "../src/lib/deck.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    notes: { type: "string" },
    out: { type: "string", default: "src/data/deck.json" },
    model: { type: "string", default: "claude-opus-5" },
  },
});

const topic = positionals.join(" ").trim();
if (!topic) {
  console.error('Usage: npm run generate -- "<topic>" [--notes "..."] [--out file.json]');
  process.exit(1);
}

// A .env file is a convenience for local runs; the environment always wins.
const envFile = path.resolve(".env");
if (!process.env.ANTHROPIC_API_KEY && existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*ANTHROPIC_API_KEY\s*=\s*"?([^"\s]+)"?\s*$/);
    if (m) process.env.ANTHROPIC_API_KEY = m[1];
  }
}

const brief = readFileSync(path.resolve("prompts/new-deck.md"), "utf8");
const example = readFileSync(path.resolve("src/data/deck.json"), "utf8");

const client = new Anthropic();

console.log(`Writing a deck about "${topic}" with ${values.model}…`);

const stream = client.messages.stream({
  model: values.model,
  max_tokens: 64000,
  system: brief,
  messages: [
    {
      role: "user",
      content: [
        `Topic: ${topic}`,
        values.notes ? `\nNotes from the author:\n${values.notes}` : "",
        "\nFor reference, here is the current deck in full (the art-history one the brief describes). Match its structure, level count, card count, and level of polish, not its subject:\n",
        "```json\n" + example + "\n```",
      ].join("\n"),
    },
  ],
  output_config: { format: zodOutputFormat(DeckSchema) },
});

let chars = 0;
stream.on("text", (text) => {
  chars += text.length;
  process.stdout.write(`\r  ${chars} characters…`);
});

const message = await stream.finalMessage();
process.stdout.write("\n");

if (message.stop_reason === "refusal") {
  console.error("Claude declined to write this deck.");
  process.exit(1);
}
if (message.stop_reason === "max_tokens") {
  console.error("The deck was cut off (max_tokens). Try again or ask for fewer levels in --notes.");
  process.exit(1);
}

const text = message.content
  .filter((block) => block.type === "text")
  .map((block) => block.text)
  .join("");

// The API guarantees schema-shaped JSON; parseDeck adds the cross-field checks
// (unique ids, distinct options, pass score within reach).
const deck = parseDeck(JSON.parse(text));

const out = path.resolve(values.out);
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(deck, null, 2) + "\n");

const cards = deck.levels.reduce((n, lv) => n + lv.questions.length, 0);
console.log(`✓ Wrote ${path.relative(process.cwd(), out)}: ${deck.title} — ${deck.levels.length} levels, ${cards} cards`);
console.log(`  ${message.usage.input_tokens} input tokens · ${message.usage.output_tokens} output tokens`);
if (values.out === "src/data/deck.json")
  console.log("  Run `npm run dev` to play it, and `npm run check-deck` to see a summary.");
else console.log(`  Copy it to src/data/deck.json to make it the active deck.`);
