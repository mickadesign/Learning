# Flashcards

**Learning new things should be fun.** Live at [humanmemory.dev](https://humanmemory.dev).
A flashcard quiz that your AI agent fills in for you: hand it one prompt, it
asks what you want to learn, writes the cards through the tools this page
exposes, and the deck opens the moment it exists. Every deck gets a link
anyone can play. Fork it and the same site runs on your own deck.

Built with **Next.js 16 (App Router)**, **Tailwind CSS 4**, and
[**Fluid Functionalism**](https://fluidfunctionalism.com/) components.

## What you get

- **An agent-first landing page.** One headline, one button: **Copy prompt**.
  Paste the prompt into whichever agent you use (Claude, Codex, Cursor, or
  anything that can open a page and call its tools). The agent opens the
  site, suggests topics or asks for one, and writes ten cards.
- **The page follows the agent.** Opened from the prompt (`/?agent`), it
  says it is waiting for the agent's first move; while the agent writes, the
  headline becomes *Creating flashcards for …* with fireworks and a big
  cursor drifting over the page; when the deck is published, it opens on its
  **Deck unlocked** moment.
- **Twelve WebMCP tools** on `document.modelContext` (and mirrored on
  `window.flashcards.call` for agents that can only run page scripts): read
  the format, find pictures, start a deck, add cards in batches, publish,
  import, generate, list, get, play, delete, and share. The reference is
  served at [`/agents.md`](public/agents.md); the wiring is in
  [`docs/webmcp.md`](docs/webmcp.md).
- **Pictures by name.** A card can say `picture: { wikipediaTitle, slot, alt }`
  and the site fetches that article's lead image from Wikipedia or Wikimedia
  Commons, licensed and credited, shown sharp with the question or blurred
  until the reveal.
- **Share any deck by link.** A deck written in the browser is stored under a
  short link (`/d/<id>`) that unfurls with its headline and pictures. The link
  is made in the background while you play and sits beside every Play button.
- **Your decks, listed.** The built-in deck and the ones written in this
  browser, each with Play and a link icon that copies the share link.
- **The quiz itself**: sequential sets of ten cards, each unlocked by passing
  the one before, a hidden bonus set on a shorter clock; three card kinds
  (multiple choice, true/false, tap-to-order); a countdown ring on timed sets;
  keyboard play on desktop; best scores saved locally; a nudge to ask your
  agent for the next deck when you are done.
- **Dark mode**, reduced-motion support, and the Fluid Functionalism motion
  system throughout: three spring speeds, a hover highlight that glides
  between answers, surfaces and shadows that hold up in both themes.

## Quick start

```bash
git clone https://github.com/mickadesign/Learning
cd Learning
npm install
npm run dev
```

Open <http://localhost:3000>, press **Copy prompt**, and paste it into your
agent. The built-in deck is the Art Timeline quiz, three sets of art history
plus a hidden one.

Two optional keys make the deployment do more:

```bash
cp .env.example .env
```

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Lets the site write decks itself through the `generate_flashcards` tool and `npm run generate`. Without it, agents write the cards with the authoring tools. |
| `BLOB_READ_WRITE_TOKEN` | A Vercel Blob store for shared decks (`/d/<id>`). Without it, sharing is quietly unavailable. On Vercel, link a Blob store to the project and `vercel env pull`. |

## Make it yours

### 1. Let an agent write the deck (no code)

Press **Copy prompt** on the landing page and paste it into your agent. The
brief (in `src/lib/agent-prompt.ts`) sends the agent to the page, has it read
`get_flashcard_format`, then `start_flashcard_deck`, `add_flashcards` with ten
cards and picture hints, and `publish_flashcard_deck`. The quiz opens on the
new deck, saved in your browser, with a share link ready. Ask the agent for
harder, easier, another angle, another set, or a new deck.

> Anyone who can reach a deployment with an `ANTHROPIC_API_KEY` can make it
> spend through the generate tool. Set a spending limit on the key, or keep
> the key off public deployments and let visitors' own agents do the writing.

### 2. Change the built-in deck

Everything the site ships with comes from **`src/data/deck.json`**: the
title, the headline question, the sets, every card, the verdicts. Change that
file and the built-in deck is about your topic.

```bash
npm run generate -- "The French Revolution"
```

Claude writes a complete deck in the house style (ramping sets, a mix of card
kinds, one-line facts, pictures for the things a card shows, a hidden bonus
set) and saves it to `src/data/deck.json`. Add `--notes "..."` for images or
constraints, or `--out decks/revolution.json` to keep the current deck.

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

### Pictures

Name the thing and the site finds the picture: `picture: { wikipediaTitle,
slot, alt }` on a choice or true/false card, resolved to the Wikipedia
article's lead image with its credit when the card is added, imported, or
generated. To pick a specific file, `npm run find-images -- "<query>"` and
the `find_flashcard_images` tool return licensed candidates. Local files go
under `public/images/` as `/images/<file>`; remote pictures must be `https://`.
The example deck's artworks are there to show the feature; replace them with
material you have the rights to use.

## Sharing

`POST /api/share` validates a deck with the site's own schema, caps it in
size, rate-limits per address, and stores it in Vercel Blob as
`decks/<id>.json`. `/d/<id>` loads it, saves it into the visitor's browser
next to their own decks, and opens the quiz, with a generated OpenGraph card
so the link unfurls with the deck's headline and pictures. Decks never change
once shared: a changed deck gets a new link. There are no accounts, so anyone
who can play a deck can share it.

## Deploy

`npm run build` prerenders the landing page; the API routes and the shared
deck pages are the server code. Deploy to Vercel with zero config, or anywhere
that runs `next start`. Environment variables:

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Enables deck generation (the generate tool and the CLI). |
| `BLOB_READ_WRITE_TOKEN` | Enables shared deck links (`/d/<id>`). |
| `FLASHCARDS_MODEL` | Which Claude model writes decks. Default `claude-opus-5`. |
| `FLASHCARDS_EFFORT` | Thinking depth for the cards: `low`, `medium` (default), `high`. |
| `FLASHCARDS_IMAGES` | `off` keeps generated decks text-only (default: attach Wikipedia lead images). |
| `NEXT_PUBLIC_SITE_URL` | Absolute site URL for OpenGraph image URLs on hosts other than Vercel. |

## Project layout

```
src/data/deck.json            ← the built-in deck (the only file a fork must change)
src/lib/deck.ts               ← schema, validation, picture hints, verdict helpers
src/components/home-screen    ← landing page: prompt button, agent presence, deck list
src/components/quiz/          ← the quiz modal (intro, cards, timer, results) + confetti
src/components/deck-list, share-link-button, wandering-cursor, landing-card-fan
src/lib/webmcp.ts             ← the twelve WebMCP tools and the agent activity store
src/lib/agent-prompt.ts       ← the brief the Copy prompt button hands out
public/agents.md              ← the capabilities reference served to agents
src/lib/image-search.ts       ← Wikipedia / Commons lookups and picture attachment
src/lib/server/generate.ts    ← plan + write sets with Claude (API routes, CLI)
src/lib/server/share.ts       ← shared decks in Vercel Blob; og-picture.ts guards the card
src/app/api/decks/, api/share ← generation and sharing routes
src/app/d/[id]/               ← a shared deck's page and OpenGraph card
src/lib/deck-store.ts         ← decks, drafts and share links saved in the browser
src/lib/__tests__/            ← vitest suite
src/components/ui, lib, hooks ← Fluid Functionalism components and systems
prompts/new-deck.md           ← the brief AI follows to write a deck
scripts/                      ← generate-deck, check-deck, find-images
docs/                         ← deck format, WebMCP wiring, animation best practices
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
npm run test         # vitest: schema, store, sharing, routes, lookups, tools
npm run check-deck   # validate src/data/deck.json (or any file you pass)
npm run generate     # write a deck with Claude: npm run generate -- "<topic>"
npm run find-images  # licensed pictures for a card: npm run find-images -- "<query>"
npm run typecheck    # tsc
npm run lint         # eslint
```

## Credits

The quiz, its motion, and the example deck come from
[Art Timeline](https://art-timeline.com/) by
[@micka_design](https://x.com/micka_design). Fonts: Inter and Instrument
Serif (SIL OFL). Licensed MIT.
