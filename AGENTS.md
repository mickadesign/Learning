# Flashcards — agent notes

A quiz site driven by one JSON file. Read this before changing anything.

## The one file that matters

`src/data/deck.json` is the deck: title, headline, levels, cards, verdicts.
It is validated by the zod schema in `src/lib/deck.ts` (`parseDeck`) at build
time and by `npm run check-deck`. Everything on screen comes from it.

To write a deck for a new topic, follow `prompts/new-deck.md` (the brief) —
or run the `/new-deck` skill in Claude Code, or `npm run generate -- "<topic>"`
with an `ANTHROPIC_API_KEY`. `options[0]` is always the correct answer; the
site shuffles.

## Generation and tools

- `src/lib/server/generate.ts` — two passes with Claude: `planDeck` (metadata
  + level briefs) and `writeLevel` (ten cards). Used by the API routes under
  `src/app/api/decks/` and by `scripts/generate-deck.mts`.
- `src/lib/create-deck.ts` — the browser pipeline: plan, then levels one by
  one, saving to `src/lib/deck-store.ts` (localStorage) after each.
- `src/lib/image-search.ts` — licensed pictures from Wikipedia (an article's
  lead image) and Wikimedia Commons (search), keyless and cross-origin.
  Behind `npm run find-images`, the `find_flashcard_images` tool, and the
  generator's picture step. Cards carry the credit in `imageCredit`; the
  quiz shows it as a caption on the reveal.
- `src/lib/webmcp.ts` — twelve WebMCP tools on `document.modelContext`: read
  the format, find images, start a draft, add cards, publish, import,
  generate, list, get, play, delete. Drafts live in `deck-store.ts` next to saved decks.
  The served reference is `public/agents.md` (plus `/llms.txt`); keep it in
  step with the tools and with `EXAMPLE_CARDS` / `AUTHORING_RULES` /
  `HOUSE_STYLE` in `src/lib/deck.ts`. Wiring notes: `docs/webmcp.md`.

## Sharing

A deck written in a browser becomes a link through Vercel Blob:
`POST /api/share` validates the deck, stores it as `decks/<id>.json` and
answers with `/d/<id>`; that page (`src/app/d/[id]/`) loads the deck, saves
it into the visitor's browser and opens the quiz, with a generated OG card
next door. `src/lib/share.ts` is the browser side (one request per deck,
link kept in `deck-store.ts` with a content fingerprint); the quiz shares a
deck in the background when its first run starts and shows the link with
the result, and `share_flashcard_deck` gives agents the same link. Needs
`BLOB_READ_WRITE_TOKEN` (a linked Blob store); without it sharing is
quietly unavailable.

## Sounds

`src/lib/sounds.ts` synthesizes the answer sounds with Web Audio (no audio
files) from one settings object, `DEFAULT_SOUNDS`: "Level up" (a quick
rising C, E, G) for a right answer, "Triple tap" (three soft taps timed to
the row's shake) for a wrong one. They play from `resolve` in the quiz and
from the landing's miniature cards. The speaker button at the page's top
right (`sound-toggle.tsx`) mutes them, remembered in local storage.

## The engine

- `src/components/quiz/quiz-modal.tsx` — the whole quiz: the "deck
  unlocked" intro (card fan, confetti, Start), three card kinds (choice,
  true/false, order), countdown ring, results, share. Levels are never
  listed: Start resumes at the first set of cards not yet passed, and a pass
  offers the next set. The cards are a faithful port of the Art Timeline
  quiz; keep their motion and copy. The results view was adapted to the
  deck model (next set instead of next level). Confetti is
  `src/components/quiz/confetti.tsx`: canvas-confetti fireworks in the
  theme's monochrome, portaled over the whole page, off under reduced
  motion.
- `src/components/agent-prompt-button.tsx` — the "Copy prompt" pill: one
  button that copies the brief in `src/lib/agent-prompt.ts` for the visitor
  to paste into their own agent.
- `src/components/home-screen.tsx` — the landing page, agent-first: the
  headline (balanced; shimmers while an agent writes), the "Copy agent
  prompt" pill, a status line that follows the agent's tool calls
  (`useAgentActivity` in `webmcp.ts`), full-page fireworks on start and
  publish (`quiz/confetti.tsx`), and the modal. There is no deck picker:
  decks are opened through the WebMCP tools (`play_flashcards`) or the Play
  button once a deck is ready. The modal takes the deck as a prop and is
  keyed by slug.
- `src/app/s/[level]/[score]/` — prerendered share pages + OG cards.
- `src/lib/`, `src/hooks/`, `src/components/ui/` — Fluid Functionalism
  components and systems (springs, surfaces, icon context, proximity hover).
  Don't retime or restyle them; compose around them. See
  `docs/animation-best-practices.md` and `.claude/fluid-functionalism.md`.

## Conventions

- Motion derives from `spring.fast/moderate/slow` in `src/lib/springs.ts`;
  no hand-written durations. Animate `transform`/`opacity` only (grid-track
  collapses are the sanctioned exception).
- `npm run typecheck && npm run lint && npm run test && npm run check-deck`
  before calling work done. Tests are vitest (`src/**/*.test.ts`, jsdom
  where a module touches the page); the WebMCP tools are tested through
  `flashcardTools()` with fake handlers, the share route with a mocked
  blob store. `npm run build` prerenders every share page and fails on an
  invalid deck.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
