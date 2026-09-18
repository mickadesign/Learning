# WebMCP tools

When the page loads it registers five tools on `document.modelContext`, the
[WebMCP](https://webmachinelearning.github.io/webmcp/) API. An agent in the
browser — Chromium's built-in WebMCP, the [MCP-B](https://docs.mcp-b.ai)
extension, or anything else that speaks the API — can list decks, write a new
one from a topic, import cards it authored itself, and open the quiz.

The registration lives in [`src/lib/webmcp.ts`](../src/lib/webmcp.ts). It
loads `@mcp-b/global`, which uses the browser's native `modelContext` when
there is one and installs a polyfill otherwise, so the tools exist everywhere.

| Tool | Input | What it does |
| --- | --- | --- |
| `list_flashcard_decks` | — | The built-in deck and every deck saved in this browser, with levels, card counts, and the visitor's best scores. |
| `create_flashcards` | `topic`, optional `notes` | Plans and writes a deck with Claude and opens the quiz on its first level; the other levels arrive in the background. Needs `ANTHROPIC_API_KEY` on the server. |
| `play_flashcards` | optional `slug` | Opens the quiz for a deck (the built-in one by default). |
| `get_flashcard_format` | — | The deck's JSON Schema — every card parameter — plus the rules the site enforces. |
| `import_flashcards` | `deck` | Validates a deck the agent wrote, saves it in this browser, and opens it. Errors name the JSON path of each problem. |

Every tool returns a text summary and a `structuredContent` object.

## Trying it

- **Chromium**: launch with `--enable-features=WebMCP`, open the site, and
  the tools appear to the browser's agent surface.
- **Any browser**: install the MCP-B extension, open the site, and the tools
  show up in the extension's tool list; an MCP client connected through it
  can call them.
- **Console**: `await document.modelContext.getTools()` lists them. With the
  polyfill, `document.modelContext.executeTool(tool, JSON.stringify(args))`
  runs one.

## Card parameters

`get_flashcard_format` returns the same schema
[`docs/deck-format.md`](deck-format.md) describes. The parameters, in the
terms people use for flashcards:

| Flashcard term | Field(s) | Notes |
| --- | --- | --- |
| Question | `prompt` (choice, order) or `statement` (truefalse) | One line, readable at a glance on timed levels. |
| Answer type | `kind`: `choice`, `truefalse`, `order` | Drives the card's layout and keyboard handling. |
| Correct answer | `options[0]`, `answer`, or `items` sorted by `value` | The site shuffles options and items itself. |
| Answer revealed | `fact` | One line shown after answering, right or wrong. |
| Picture | `image` (shown while answering) or `revealImage` (blurred until the answer), `imageAlt` | A path under `/public` or an `https://` URL. |
