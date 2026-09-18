---
name: new-deck
description: Write or rewrite the flashcard deck (src/data/deck.json) for a new topic, following the house brief in prompts/new-deck.md. Use when the user asks for a quiz, deck, or flashcards about a subject, wants more levels or cards, or wants existing cards rewritten.
---

# New deck

The whole site is driven by one file, `src/data/deck.json`, validated by the
zod schema in `src/lib/deck.ts`. Writing a deck means writing that file.

1. Read `prompts/new-deck.md` in full. It is the brief: the deck format, the
   level ramp, the mix of card kinds, the tone. Follow it exactly.
2. Read the current `src/data/deck.json` once, as the reference for shape and
   polish. Keep its structure (four levels of ten cards, the last one hidden
   and on a 10-second clock) unless the user asks for something else.
3. Ask the user only for what you cannot decide: the topic if it is missing,
   and whether they have images to use. Never invent image paths; a deck
   without images is fine. If they hand you image files, copy them under
   `public/images/` and reference them as `/images/<file>`.
4. Write the deck. `options[0]` is always the correct answer. Question ids are
   unique across the deck. Facts are true and one line long.
5. Pictures: for cards about something you can look at, run
   `npm run find-images -- "<the thing>" --json` (add `--title` with the
   exact Wikipedia title when you know it), put the chosen URL in `image`
   ("what is this?") or `revealImage` ("who made X?"), write an `imageAlt`
   that doesn't name the answer, and copy the `credit` into `imageCredit`.
   Never invent an image URL.
6. Run `npm run check-deck` and fix every error and warning it prints.
7. Tell the user what you wrote (levels, card counts, anything you were unsure
   about factually) and that `npm run dev` plays it.
