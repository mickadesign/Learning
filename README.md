# Flashcards

**Learning new things should be fun.** This is the quiz from
[Art Timeline](https://github.com/mickadesign/ArtTimeline), lifted out into a
project anyone can fork: swap one JSON file and the same site quizzes people on
your topic. Write the deck yourself, or let an AI write it for you.

Built with **Next.js 16 (App Router)**, **Tailwind CSS 4**, and
[**Fluid Functionalism**](https://fluidfunctionalism.com/) components.

## What you get

- **Type a topic, get a quiz.** The landing page asks one question — *what
  topic are you interested in learning?* — in a borderless combobox. Pick a
  deck to play, or type anything and Claude plans four levels and writes
  them one at a time; the quiz opens on the first level while the rest are
  written. Decks are saved in the browser.
- **Built for agents too.** On load the page registers ten WebMCP tools on
  `document.modelContext`: read the format, start a deck, add cards in
  batches, publish, import, generate, play, delete. The reference is served
  at [`/agents.md`](public/agents.md); the wiring is in
  [`docs/webmcp.md`](docs/webmcp.md).
- **Sequential levels** of ten cards, each unlocked by passing the one before
  it, with a hidden bonus level on a shorter clock.
- **Three card kinds**: multiple choice, true/false, and tap-to-order.
- **Illustrated cards**: an image shown sharp with the question, or blurred
  and revealed with the answer.
- **Timed levels** with a countdown ring and an odometer briefing screen.
- **Keyboard play** on desktop (digits answer, Enter advances), touch-tuned on
  phones.
- **Best scores** saved locally; **share to X** with a prerendered
  OpenGraph card for every level × score.
- **Dark mode**, reduced-motion support, and the Fluid Functionalism motion
  system throughout: three spring speeds, a hover highlight that glides
  between answers, surfaces and shadows that hold up in both themes.

## Quick start

```bash
git clone https://github.com/mickadesign/Learning flashcards
cd flashcards
npm install
npm run dev
```

Open <http://localhost:3000>. The built-in deck is the Art Timeline quiz,
four levels of art history. To write new decks in the browser, add a key:

```bash
cp .env.example .env    # add your ANTHROPIC_API_KEY, then restart the dev server
```

Now type any topic into the landing page. Planning takes a few seconds, the
first level under a minute, and the quiz opens as soon as it exists.

## Make it yours

Three layers, from lightest to deepest:

### 1. In the browser (no code)

Type a topic. `POST /api/decks/plan` asks Claude for the deck's metadata and
four level briefs; `POST /api/decks/level` writes ten cards per level, one
request each, so the first level is playable while the others arrive. Decks
land in `localStorage` and show up in the combobox next time.

Without a key, the landing page shows **Copy agent prompt** instead: one
click copies a brief for your own AI agent (or opens it in Claude, Codex, or
Cursor). The agent opens this page, asks what you want to learn, writes your
first ten cards through the WebMCP tools, and iterates with you from there.
The brief lives in `src/lib/agent-prompt.ts`.

An agent on the page doesn't need the UI or the key: it can write the deck
itself through the WebMCP tools — `start_flashcard_deck`, `add_flashcards`,
`publish_flashcard_deck` — and read everything it needs from
`get_flashcard_format`. The full reference is [`/agents.md`](public/agents.md).

> Anyone who can reach a deployment with a key can make it spend. Set a
> spending limit on the key, or put the site behind auth, before sharing a
> public URL.

### 2. Change the built-in deck

Everything the site ships with comes from **`src/data/deck.json`**: the
title, the headline question, the intro, the levels, every card, the
verdicts. Change that file and the built-in deck is about your topic.

```bash
npm run generate -- "The French Revolution"
```

Claude writes a complete deck in the house style (four ramping levels, a mix
of card kinds, one-line facts, a hidden bonus level) and saves it to
`src/data/deck.json`. Add `--notes "..."` to hand it images or constraints,
or `--out decks/revolution.json` to keep the current deck.

### 3. With a coding agent

Open the repo in Claude Code and run `/new-deck The French Revolution`. The
skill in `.claude/skills/new-deck/` knows the format and the checks. Any agent
that reads `AGENTS.md` (Cursor, Codex, Copilot) gets the same instructions.

### 4. With any chat AI

Paste [`prompts/new-deck.md`](prompts/new-deck.md) into a chat, add your
topic, and save the JSON it returns as `src/data/deck.json`.

### 5. By hand

The format is documented in [`docs/deck-format.md`](docs/deck-format.md).
Then:

```bash
npm run check-deck
```

It validates the deck (the build does too) and prints a summary with
warnings where you drift from the reference shape.

### Images

Drop files under `public/images/` and reference them as
`/images/<file>` in a card's `image` or `revealImage`. Remote `https://`
URLs work as well. The example deck's artworks are there to show the feature;
replace them with material you have the rights to use.

## Deploy

`npm run build` prerenders the landing page and every share page and card;
the two generation routes are the only server code. Deploy to Vercel with
zero config, or anywhere that runs `next start`. Environment variables:

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Enables deck generation (in-site, WebMCP, and the CLI). Without it the site plays the built-in deck and says so. |
| `FLASHCARDS_MODEL` | Which Claude model writes decks. Default `claude-opus-5`. |
| `FLASHCARDS_EFFORT` | Thinking depth for the cards: `low`, `medium` (default), `high`. |
| `NEXT_PUBLIC_SITE_URL` | Absolute site URL for the share cards' image URLs on hosts other than Vercel. |

## Project layout

```
src/data/deck.json          ← the deck (the only file a fork must change)
src/lib/deck.ts             ← schema, validation, verdict + share text helpers
src/components/quiz/        ← the quiz modal (levels, cards, timer, results)
src/components/home-screen  ← landing page: the topic combobox + the quiz
src/lib/webmcp.ts           ← WebMCP tools registered on page load
public/agents.md            ← the capabilities reference served to agents
src/lib/server/generate.ts  ← plan + write levels with Claude (API routes, CLI)
src/app/api/decks/          ← status, plan, level routes
src/lib/deck-store.ts       ← decks saved in the browser
src/app/s/[level]/[score]/  ← share pages + OpenGraph images
src/components/ui, lib, hooks ← Fluid Functionalism components and systems
prompts/new-deck.md         ← the brief AI follows to write a deck
scripts/                    ← generate-deck (Claude API) and check-deck
docs/                       ← deck format, WebMCP tools, animation best practices
```

## Fluid Functionalism setup

Components are pulled from the `@fluid` registry, configured in
[`components.json`](components.json):

```jsonc
"registries": { "@fluid": "https://www.fluidfunctionalism.com/r/{name}.json" }
```

> The installed Radix primitives are v1 (no `render` prop), so the
> **base-ui variants** of `@fluid` components are used (they target
> `@base-ui/react`, which supports `render`). Motion follows the tokens in
> `src/lib/springs.ts`; see [`docs/animation-best-practices.md`](docs/animation-best-practices.md).

## Scripts

```bash
npm run dev          # start the dev server
npm run build        # production build (type-check + lint + prerender)
npm run check-deck   # validate src/data/deck.json (or any file you pass)
npm run generate     # write a deck with Claude: npm run generate -- "<topic>"
npm run typecheck    # tsc
npm run lint         # eslint
```

## Credits

The quiz, its motion, and the example deck come from
[Art Timeline](https://art-timeline.com/) by
[@micka_design](https://x.com/micka_design). Fonts: Inter and Instrument
Serif (SIL OFL). Licensed MIT.
