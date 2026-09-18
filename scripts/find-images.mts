// Find licensed pictures for a card, from Wikipedia and Wikimedia Commons.
//
//   npm run find-images -- "Las Meninas"
//   npm run find-images -- "V60 coffee dripper" --title "Hario V60"
//   npm run find-images -- "Bayeux Tapestry" --json
import { parseArgs } from "node:util";
import { creditFor, findImages } from "../src/lib/image-search.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    title: { type: "string" },
    limit: { type: "string", default: "5" },
    json: { type: "boolean", default: false },
  },
});
const query = positionals.join(" ").trim();
if (!query) {
  console.error('Usage: npm run find-images -- "<query>" [--title "Exact Wikipedia title"] [--limit 5] [--json]');
  process.exit(1);
}

const found = await findImages(query, { title: values.title, limit: Number(values.limit) });
if (values.json) {
  console.log(JSON.stringify(found.map((c) => ({ ...c, credit: creditFor(c) })), null, 2));
} else if (!found.length) {
  console.log("No reusable image found. Try an exact Wikipedia title with --title, or a different query.");
} else {
  found.forEach((c, i) => {
    console.log(`${i + 1}. ${c.title}${c.author ? ` — ${c.author}` : ""}${c.license ? ` · ${c.license}` : " · license unknown"} (${c.origin})`);
    console.log(`   ${c.url}`);
    console.log(`   source: ${c.source}`);
  });
}
