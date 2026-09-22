# WebMCP tools

When the page loads it registers its flashcard actions as tools on
`document.modelContext`, the [WebMCP](https://webmachinelearning.github.io/webmcp/)
API. An agent in the browser — Chromium's built-in WebMCP, the
[MCP-B](https://docs.mcp-b.ai) extension, or anything else that speaks the
API — can read the card format, write a deck in steps, import one, have the
site's AI write one, play, and clean up.

**The full reference — every tool, its inputs and outputs, the card format
and the house style — is served with the site at
[`/agents.md`](../public/agents.md)** (`public/agents.md` in the repository),
with a short pointer at `/llms.txt`. The landing page links to it as "For
agents", and the `<head>` carries
`<link rel="alternate" type="text/markdown" href="/agents.md">`.

## The tools at a glance

| Tool | Purpose |
| --- | --- |
| `get_flashcard_format` | Read first: workflow, rules, house style; `section` for examples or the JSON Schema. |
| `find_flashcard_images` | Licensed pictures from Wikipedia / Commons, with a ready-made credit. |
| `list_flashcard_decks` | Built-in and saved decks with best scores, plus drafts. |
| `get_flashcard_deck` | Full JSON of a deck or draft. |
| `start_flashcard_deck` | Begin a draft: metadata and levels without cards. |
| `add_flashcards` | Append cards to a level of a draft, in batches; ids assigned. |
| `publish_flashcard_deck` | Validate, save, and open a draft. |
| `import_flashcards` | Save a complete deck in one call. |
| `generate_flashcards` | Have the server's Claude write a deck (needs a key). |
| `share_flashcard_deck` | A short link (`/d/<id>`) to a saved deck, stored in Vercel Blob (needs a store). |
| `play_flashcards` | Open the quiz on a deck. |
| `delete_flashcard_deck` | Remove a saved deck or draft. |

## Agents without a WebMCP host

Most agents today reach the tools through a "run a script on the page"
tool, not a native host. For them the page installs `window.flashcards`:
`call(name, args)` runs a tool by name and returns a plain object, and
`tools()` lists them. It is installed before the WebMCP runtime loads and
works without it. The polyfill's own `executeTool(tool, json)` needs the
live object from `getTools()` (it carries the page `window`, so it can't be
serialized or rebuilt), which is exactly what script-driven agents got
wrong; `/agents.md` shows both paths. Tool results are kept small for the
same reason — script tools cap and screen large page-derived text.

## How it's wired

- `src/lib/webmcp.ts` defines the tools and registers them from the landing
  page through `useWebMcpTools`. The page lends it the handlers that touch
  React state (open a deck, generate, list, find, delete); everything else
  goes straight to `src/lib/deck-store.ts` (saved decks and drafts in
  `localStorage`).
- Input schemas are JSON Schema. The complex ones (`start_flashcard_deck`,
  `add_flashcards`, `import_flashcards`) are derived at runtime from the zod
  schemas in `src/lib/deck.ts`, so the tools and the site can never disagree
  about the format. Every input is re-validated with zod inside the tool.
- `find_flashcard_images` runs `src/lib/image-search.ts` in the browser:
  the Wikipedia page-summary endpoint (an article's lead image) and the
  Commons search API, both keyless and cross-origin. The same module serves
  the CLI (`npm run find-images`) and the server generator.
- Cards sent to `add_flashcards` or `import_flashcards` may carry a
  `picture: { wikipediaTitle, slot, alt }` hint instead of image fields
  (`PictureHintSchema` in `src/lib/deck.ts`). `attachPicture` in
  `image-search.ts` resolves it on the page, the way the server generator
  does: the article's lead image goes in the slot with alt and credit; a
  hint with no free image is dropped and named in the result. The add
  result also counts the level's cards still without a picture.
- Agent presence: every tool call is noted in a small store in `webmcp.ts`
  (`useAgentActivity`), and publish/import mark the deck done. The home
  screen's status line follows it ("Your agent is writing cards…"), falls
  back after 90 s of silence, and shows "Waiting for its first move" when
  the page was opened at `/agent`, which is where the copied agent prompt
  sends the agent.
- `@mcp-b/global` is imported lazily in the browser. It wraps the native API
  when present and installs a polyfill otherwise.
- Example cards, the rules and the house style live in `src/lib/deck.ts`
  (`EXAMPLE_CARDS`, `AUTHORING_RULES`, `HOUSE_STYLE`) so the tool, the docs
  and the site say the same thing. Keep `public/agents.md` in step when they
  change.

## Trying it

- **Chromium**: launch with `--enable-features=WebMCP`, open the site, and the
  tools appear to the browser's agent surface.
- **Any browser**: install the MCP-B extension; the tools show up in its tool
  list, and an MCP client connected through it can call them.
- **Console**: `await document.modelContext.getTools()` lists them. With the
  polyfill, `document.modelContext.executeTool(tool, JSON.stringify(args))`
  runs one:

```js
const ctx = document.modelContext;
const tools = await ctx.getTools();
const call = (name, args) =>
  ctx.executeTool(tools.find((t) => t.name === name), JSON.stringify(args)).then(JSON.parse);
await call("start_flashcard_deck", { title: "Tides", headline: "Do you know the tides?", tagline: "Moon, sun, sea.", verdicts: { low: "Landlubber.", mid: "Deckhand.", high: "Navigator.", perfect: "Harbourmaster." }, levels: [{ id: "shore", name: "Shore", tagline: "The basics." }] });
await call("add_flashcards", { slug: "tides", level: "shore", cards: [{ kind: "truefalse", statement: "The Moon causes the tides on its own.", answer: false, fact: "The Sun contributes about a third of the tidal force." }] });
await call("publish_flashcard_deck", { slug: "tides" });
```
