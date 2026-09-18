# Flashcards — capabilities for agents

This site plays flashcard quizzes and lets anyone write a new deck about any
topic. If you are an agent on this page, you don't need to drive the UI: the
page registers tools on `document.modelContext` (the
[WebMCP](https://webmachinelearning.github.io/webmcp/) API) the moment it
loads. This file lists every one of them, what each takes and returns, and
the shortest path to a finished deck.

- Site: the page you are on. Source: <https://github.com/mickadesign/Learning>.
- Protocol: WebMCP. `await document.modelContext.getTools()` lists the tools;
  your host calls them. In a browser without native support the page installs
  a polyfill (`@mcp-b/global`), so the tools are always there.
- No WebMCP host? If your browser tool can only run scripts on the page, use
  the helper the page installs: `await window.flashcards.call("<tool name>",
  { ...args })` returns the tool's result as a plain object, and
  `window.flashcards.tools()` lists the tools with their input schemas. See
  "Calling the tools from a page script" below.
- Storage: decks you make are saved in this browser's `localStorage` only. No
  accounts, no server-side storage.
- The built-in deck (slug `art-timeline`) is always present and can't be
  deleted.

## The shortest path to a new deck

1. `get_flashcard_format` — read the format, one example of each card kind,
   the rules, and the house style.
2. `start_flashcard_deck` — title, headline (a question), tagline, verdicts,
   and the levels without cards. You get a slug back.
3. `add_flashcards` — about ten cards per level, in one or more batches.
   For a card about something you can look at, add
   `picture: { wikipediaTitle, slot, alt }`; the site fetches that article's
   lead image and credits it. No URL to find or copy.
4. `publish_flashcard_deck` — validates, saves, and opens the quiz.

About four levels of ten cards is a complete deck; a single level of ten is
already playable. Everything is validated as you go, and errors name the
JSON path of each problem.

Two shortcuts:

- `import_flashcards` saves a complete deck in one call.
- `generate_flashcards` asks the site's own AI to write the deck. It only
  works when the deployment has an Anthropic key on the server; when it
  doesn't, the error says so and points you to the authoring tools.

## Calling the tools from a page script

A native WebMCP host calls the tools for you. Without one, drive them from
the page:

```js
// Simplest: the page helper. Plain objects in and out.
const decks = await window.flashcards.call("list_flashcard_decks", {});
const guide = await window.flashcards.call("get_flashcard_format", {});
const draft = await window.flashcards.call("start_flashcard_deck", { title: "…", headline: "…?", tagline: "…", verdicts: { low: "…", mid: "…", high: "…", perfect: "…" }, levels: [{ id: "one", name: "One", tagline: "…" }] });
await window.flashcards.call("add_flashcards", { slug: draft.structuredContent.slug, level: "one", cards: [/* … */] });
await window.flashcards.call("publish_flashcard_deck", { slug: draft.structuredContent.slug });
```

Through the standard API instead, `document.modelContext.executeTool` takes
the **tool object from `getTools()`**, not its name — and that object holds a
reference to the page's `window`, so it can't be serialized or rebuilt by
hand. Look it up fresh in the same script:

```js
const ctx = document.modelContext;
const tool = (await ctx.getTools()).find((t) => t.name === "list_flashcard_decks");
const result = JSON.parse(await ctx.executeTool(tool, JSON.stringify({})));
```

Results are small by design; `get_flashcard_format` is about 3 KB unless you
ask for the schema or examples.

## Tools

Every tool returns `content` (one text block) and `structuredContent` (an
object). Failures throw with a message that says what to fix.

### `get_flashcard_format` — read-only

Input: `{ section? }` — `"guide"` (default), `"examples"`, `"schema"`, or
`"all"`.

The guide is the workflow, the rules the site enforces, and the house style
(about 3 KB). `"examples"` returns one card of each kind, including one with
a picture and credit; `"schema"` the deck JSON Schema; `"all"` everything.
`structuredContent` carries the same as objects: `{ workflow, rules,
houseStyle }`, `{ examples }`, `{ schema }`.

### `find_flashcard_images` — read-only

Input: `{ query, title?, limit? }` — what to look for; the exact English
Wikipedia article title when you know it (its lead image comes first);
at most `limit` candidates (default 5).

Returns licensed pictures from Wikipedia and Wikimedia Commons: for each, a
`url` sized for the card, the `source` page, `author`, `license`, and a
ready-made `credit` to copy into the card's `imageCredit`. Non-free images
are left out; a missing license is reported as unknown. `structuredContent`:
`{ candidates: [{ url, width, height, title, source, author?, license?, origin, credit }] }`.

### `list_flashcard_decks` — read-only

Input: none.

Returns the playable decks (built-in and saved) with their levels, card
counts and the visitor's best scores, plus drafts in progress.
`structuredContent`: `{ decks: DeckSummary[], drafts: [{ slug, title, levels }] }`.

### `get_flashcard_deck` — read-only

Input: `{ slug }`.

Returns the full JSON of a deck or draft. `structuredContent`:
`{ status: "built-in" | "saved" | "draft", deck }`.

### `start_flashcard_deck`

Input: the deck's metadata and its levels without cards.

| Field | Type | Notes |
| --- | --- | --- |
| `title` | string | Site name for this deck. |
| `headline` | string | The big question, e.g. "Are you a coffee nerd?" |
| `tagline` | string | One line. |
| `verdicts` | `{ low, mid, high, perfect }` | Results line by score band: ≤ 30 %, ≤ 60 %, < 100 %, 100 %. |
| `levels` | `[{ id, name, tagline, timed?, timerSeconds?, hidden? }]` | In play order. `id` is lowercase with dashes. |
| `slug` | string, optional | Derived from the title if omitted; made unique if taken. |
| `intro` | string[], optional | Short paragraphs for the landing page. |
| `cta` | string, optional | Button label. Default "Test knowledge". |
| `author` | `{ name, url? }`, optional | Credit line. |
| `passScore` | integer, optional | Score that unlocks the next level. Default 7. |
| `timerSeconds` | integer, optional | Countdown per card on timed levels. Default 20. |

Returns the slug and the level ids. `structuredContent`: `{ slug, levels, passScore }`.

### `add_flashcards`

Input: `{ slug, level, cards }` — the draft's slug, a level id, and one or
more cards. A card is one of:

```jsonc
{ "kind": "choice", "prompt": "…", "options": ["correct", "wrong", "wrong", "wrong"], "fact": "…" }
{ "kind": "truefalse", "statement": "…", "answer": false, "fact": "…" }
{ "kind": "order", "prompt": "…", "items": [{ "label": "…", "value": 1 }, { "label": "…", "value": 2 }, { "label": "…", "value": 3 }], "fact": "…" }
```

Optional on any card: `id` (assigned as `<level>-<n>` when omitted).

Optional on choice and truefalse cards, a picture, one of two ways:

- `picture: { wikipediaTitle, slot, alt }` — the exact English Wikipedia
  article title of the thing pictured, the slot (`"image"` shows sharp
  while answering, `"revealImage"` stays blurred until the answer; default
  `revealImage`, and always the reveal on truefalse), and alt text that
  doesn't name the answer. The site fetches the article's lead image, sets
  the slot and fills in `imageCredit`. When the article has no free image
  the hint is dropped and the result names it.
- `image` or `revealImage` (an `https://` URL from `find_flashcard_images`),
  `imageAlt`, and `imageCredit` (`{ title?, author?, license?, source? }`,
  shown as a caption once the answer is revealed), when you want a
  specific file.

Returns the level's counts by kind, which pictures were attached, how many
cards in the level still have none, and what the draft still needs.
`structuredContent`: `{ slug, level, added: string[], levels: [{ id, cards }], gaps: string[], pictures: { attached: string[], missing: string[], withoutPicture: number } }`.
Nothing is added if any card in the batch is invalid.

### `publish_flashcard_deck`

Input: `{ slug, open? }` (`open` defaults to true).

Validates the whole draft (unique ids, distinct options, every level at or
above `passScore`), saves it as a playable deck, removes the draft, and opens
the quiz. `structuredContent`: `{ slug, title, levels, cards }`.

### `import_flashcards`

Input: `{ deck, replace? }` — a complete deck matching the JSON Schema from
`get_flashcard_format`. Cards may carry the same `picture` hint as in
`add_flashcards`; it is resolved before validation. If a saved deck already
uses the slug, a new slug is chosen unless `replace` is true. Opens the quiz
on it. `structuredContent`: `{ slug, title, pictures: { missing: string[] } }`.

### `generate_flashcards`

Input: `{ topic, notes? }`.

The server plans a deck and writes it one level at a time; the tool resolves
once the first level is playable and the quiz is open, while the rest keep
arriving. Requires `ANTHROPIC_API_KEY` on the deployment. `structuredContent`:
`{ slug, title, headline }`.

### `play_flashcards`

Input: `{ slug? }` — omit for the built-in deck.

Opens the quiz. The visitor plays from there: levels unlock in order by
reaching `passScore`; best scores are kept per deck.

### `delete_flashcard_deck`

Input: `{ slug }`.

Removes a saved deck or a draft. The built-in deck can't be deleted.

## Card format

| Parameter | Field(s) | Notes |
| --- | --- | --- |
| Question | `prompt` (choice, order) or `statement` (truefalse) | One line, readable at a glance on timed levels. |
| Answer type | `kind`: `choice`, `truefalse`, `order` | Drives the card's layout and keyboard handling. |
| Correct answer | `options[0]`, `answer`, or `items` sorted by `value` | The site shuffles options and items itself. |
| Answer revealed | `fact` | One line shown after answering, right or wrong. |
| Picture | `image` or `revealImage`, plus `imageAlt` and `imageCredit` | A path under `/public` or an `https://` URL that exists. Credit shows on the reveal. |

## Pictures

A picture earns its place when the card is about something you can look at:
a work of art, a building, a species, an object, a map.

- The easy way: name it. Put `picture: { wikipediaTitle, slot, alt }` on
  the card with the exact English Wikipedia article title, and the site
  fetches that article's lead image and credits it when the card is added
  or imported. Only name an article you are sure exists.
- To choose a specific file, `find_flashcard_images` returns licensed
  candidates: give the exact Wikipedia title when you can name the thing,
  a search query otherwise. Pick the one whose title matches, put its `url`
  in `image` or `revealImage`, and copy its `credit` into `imageCredit`.
- Never invent an image URL.
- `image` shows sharp while answering: "what is this?" cards. `revealImage`
  stays blurred until the answer: "who made X?" cards, so the picture can't
  give it away. True/false cards only take `revealImage`.
- `imageAlt` says what the picture shows without naming the answer.
- Pictures are loaded from the source directly; nothing is uploaded or
  stored here.

Rules the site enforces:

- `options[0]` is the correct answer; the site shuffles options, you must not.
- `options` has 2 to 6 entries (4 is the sweet spot); `items` has 3 to 5,
  listed lowest value first.
- Every card has a `fact`.
- Question ids are unique across the deck; level ids are unique.
- `passScore` can't exceed a level's card count.
- Slugs and level ids are lowercase letters, digits and dashes.

## House style

The reference deck is an art-history quiz. Decks that feel like it:

- Levels ramp: famous basics, then relationships and "why", then exact
  numbers and deep cuts (timed), then a hidden last level on a 10-second
  clock mixing every trick.
- Ten cards per level, mixing kinds: about six `choice`, two `truefalse`, one
  or two `order`.
- Distractors are plausible and from the same domain. No "all of the above",
  no jokes as options.
- About half the true/false statements are false, and a false one is a common
  misconception rather than nonsense.
- Warm, precise, a little playful. Second person. No exclamation marks in
  prompts. Verdicts are flavoured by the topic.
- Facts must be true. Prefer well-established facts over disputed trivia.
- Pictures show real things and carry their credit.

## For developers

The tools are registered in `src/lib/webmcp.ts`; the schema they share with
the site is `src/lib/deck.ts`. The human docs are in the repository's
`README.md` and `docs/` folder.
