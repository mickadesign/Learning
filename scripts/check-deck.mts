// Validate a deck file and print a summary. Usage:
//   npm run check-deck              # checks src/data/deck.json
//   npm run check-deck -- path.json # checks another file
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseDeck } from "../src/lib/deck.ts";

const file = path.resolve(process.argv[2] ?? "src/data/deck.json");
const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
const deck = parseDeck(raw);

const warnings: string[] = [];
const publicDir = path.resolve("public");

deck.levels.forEach((lv, i) => {
  if (lv.questions.length !== 10)
    warnings.push(
      `level "${lv.id}" has ${lv.questions.length} questions (the reference deck uses 10)`
    );
  if (lv.hidden && i === 0) warnings.push(`the first level ("${lv.id}") is hidden — nobody can unlock it`);
  const kinds = new Set(lv.questions.map((q) => q.kind));
  if (lv.questions.length >= 6 && kinds.size === 1)
    warnings.push(`level "${lv.id}" uses a single question kind — mix choice, truefalse and order`);
  for (const q of lv.questions) {
    const images = [
      q.kind !== "order" ? q.revealImage : undefined,
      q.kind === "choice" ? q.image : undefined,
    ];
    for (const src of images) {
      if (src && src.startsWith("/") && !existsSync(path.join(publicDir, src)))
        warnings.push(`${q.id}: image "${src}" not found under public/`);
    }
    if (q.fact.length > 160) warnings.push(`${q.id}: fact is ${q.fact.length} chars — keep it to one line`);
  }
});

const counts = { choice: 0, truefalse: 0, order: 0 };
for (const lv of deck.levels) for (const q of lv.questions) counts[q.kind]++;

console.log(`✓ ${path.relative(process.cwd(), file)} is a valid deck`);
console.log(`  ${deck.title} — "${deck.headline}"`);
for (const lv of deck.levels)
  console.log(
    `  · ${lv.name} (${lv.id}): ${lv.questions.length} cards${lv.timed ? `, timed ${lv.timerSeconds ?? deck.timerSeconds}s` : ""}${lv.hidden ? ", hidden" : ""}`
  );
console.log(
  `  ${counts.choice} choice · ${counts.truefalse} true/false · ${counts.order} order · pass at ${deck.passScore}`
);
if (warnings.length) {
  console.log("\nWarnings:");
  for (const w of warnings) console.log(`  ! ${w}`);
}
