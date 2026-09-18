# Flashcards

**Learning new things should be fun.** This is the quiz from
[Art Timeline](https://github.com/mickadesign/ArtTimeline), lifted out into a
project anyone can fork: swap one JSON file and the same site quizzes people on
your topic. Write the deck yourself, or let an AI write it for you.

Built with **Next.js 16 (App Router)**, **Tailwind CSS 4**, and
[**Fluid Functionalism**](https://fluidfunctionalism.com/) components.

## What you get

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

Open <http://localhost:3000>. You're playing the example deck: the Art
Timeline quiz, four levels of art history.

## Make it yours

Everything on screen comes from **`src/data/deck.json`**: the title, the
headline question, the intro, the levels, every card, the verdicts. Change
that file and the site is about your topic.

### 1. With Claude, from the terminal

```bash
cp .env.example .env    # add your ANTHROPIC_API_KEY
npm run generate -- "The French Revolution"
```

Claude writes a complete deck in the house style (four ramping levels, a mix
of card kinds, one-line facts, a hidden bonus level) and saves it to
`src/data/deck.json`. Add `--notes "..."` to hand it images or constraints,
or `--out decks/revolution.json` to keep the current deck.

### 2. With a coding agent

Open the repo in Claude Code and run `/new-deck The French Revolution`. The
skill in `.claude/skills/new-deck/` knows the format and the checks. Any agent
that reads `AGENTS.md` (Cursor, Codex, Copilot) gets the same instructions.

### 3. With any chat AI

Paste [`prompts/new-deck.md`](prompts/new-deck.md) into a chat, add your
topic, and save the JSON it returns as `src/data/deck.json`.

### 4. By hand

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

It's a static Next.js site: `npm run build` prerenders the landing page and
every share page and card. Deploy to Vercel with zero config, or anywhere
that runs `next start`. Set `NEXT_PUBLIC_SITE_URL` on hosts other than Vercel
so the share cards get absolute image URLs.

## Project layout

```
src/data/deck.json          ← the deck (the only file a fork must change)
src/lib/deck.ts             ← schema, validation, verdict + share text helpers
src/components/quiz/        ← the quiz modal (levels, cards, timer, results)
src/components/home-screen  ← landing page
src/app/s/[level]/[score]/  ← share pages + OpenGraph images
src/components/ui, lib, hooks ← Fluid Functionalism components and systems
prompts/new-deck.md         ← the brief AI follows to write a deck
scripts/                    ← generate-deck (Claude API) and check-deck
docs/                       ← deck format, animation best practices
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
