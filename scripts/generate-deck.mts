// Generate a deck with Claude and write it to src/data/deck.json — the same
// two-pass pipeline the site uses (src/lib/server/generate.ts).
//
//   npm run generate -- "The French Revolution"
//   npm run generate -- "Coffee brewing" --notes "Images available: /images/v60.jpg (a V60 dripper)"
//   npm run generate -- "Chess openings" --out decks/chess.json
//
// Needs ANTHROPIC_API_KEY in the environment (or a .env file, see
// .env.example). The brief the model follows is prompts/new-deck.md.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { assembleDeck, type QuizQuestion } from "../src/lib/deck.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    notes: { type: "string" },
    out: { type: "string", default: "src/data/deck.json" },
    levels: { type: "string", default: "4" },
  },
});

const topic = positionals.join(" ").trim();
if (!topic) {
  console.error('Usage: npm run generate -- "<topic>" [--notes "..."] [--out file.json] [--levels 4]');
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

// Imported after the .env pass so the client sees the key.
const { MODEL, planDeck, promptsOf, writeLevel } = await import("../src/lib/server/generate.ts");

console.log(`Planning a deck about "${topic}" with ${MODEL}…`);
const plan = await planDeck(topic, { notes: values.notes, levels: Number(values.levels) });
console.log(`  "${plan.title}" — ${plan.headline}`);

const cards: Record<string, QuizQuestion[]> = {};
const avoid: string[] = [];
for (const [i, level] of plan.levels.entries()) {
  process.stdout.write(`Writing level ${i + 1}/${plan.levels.length}: ${level.name}… `);
  const questions = await writeLevel({ topic, plan, level, avoid, notes: values.notes });
  cards[level.id] = questions;
  avoid.push(...promptsOf(questions));
  console.log(`${questions.length} cards`);
}

const deck = assembleDeck(plan, cards);
const out = path.resolve(values.out);
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(deck, null, 2) + "\n");

const total = deck.levels.reduce((n, lv) => n + lv.questions.length, 0);
console.log(`✓ Wrote ${path.relative(process.cwd(), out)}: ${deck.levels.length} levels, ${total} cards`);
if (values.out === "src/data/deck.json")
  console.log("  Run `npm run dev` to play it, and `npm run check-deck` to see a summary.");
else console.log("  Copy it to src/data/deck.json to make it the built-in deck.");
