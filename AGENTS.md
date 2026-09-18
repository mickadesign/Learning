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

## The engine

- `src/components/quiz/quiz-modal.tsx` — the whole quiz: level list, three
  card kinds (choice, true/false, order), countdown ring, results, share. It
  is a faithful port of the Art Timeline quiz; keep its motion and copy.
- `src/components/home-screen.tsx` — the landing page around the modal.
- `src/app/s/[level]/[score]/` — prerendered share pages + OG cards.
- `src/lib/`, `src/hooks/`, `src/components/ui/` — Fluid Functionalism
  components and systems (springs, surfaces, icon context, proximity hover).
  Don't retime or restyle them; compose around them. See
  `docs/animation-best-practices.md` and `.claude/fluid-functionalism.md`.

## Conventions

- Motion derives from `spring.fast/moderate/slow` in `src/lib/springs.ts`;
  no hand-written durations. Animate `transform`/`opacity` only (grid-track
  collapses are the sanctioned exception).
- `npm run typecheck && npm run lint && npm run check-deck` before calling
  work done. `npm run build` prerenders every share page and fails on an
  invalid deck.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
