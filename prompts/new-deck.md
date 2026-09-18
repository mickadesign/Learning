# Write a flashcard deck

You are writing the content for a quiz site. The site is fixed; only the deck
changes. Your output is one JSON object that follows the deck format below.
Write it for the topic given at the end of this brief.

## What a good deck feels like

The reference deck is an art-history quiz: four levels of ten cards that go
from famous names to exact dates, with every wrong answer still teaching
something. Copy its shape:

- **Levels ramp.** Level 1 is famous basics anyone half-curious would enjoy.
  Level 2 is relationships, attributions, and "why". Level 3 is exact
  numbers, dates, and deep cuts, and it is **timed**. The last level is
  **hidden**, timed on a shorter clock (10 seconds), and mixes every trick.
- **Ten cards per level**, mixing kinds: about six `choice`, two
  `truefalse`, and one or two `order`. Never ten of the same kind in a row.
- **Distractors are plausible** and come from the same domain (four painters,
  not three painters and a composer). No "all of the above", no jokes as
  options, no option that is obviously longer than the others.
- **Every card has a `fact`**: one sentence (under ~140 characters) shown
  after the answer, correct or not. It should add something the question
  didn't say, not repeat the answer.
- **True/false statements are crisp** and about half of them are false.
  A false statement should be a common misconception, not a nonsense claim.
- **Order cards** list three to five items with a numeric `value` to sort by
  (a year, a size, a rank). Items are listed lowest value first in the JSON;
  the site shuffles them. The `prompt` says what "earliest" means here.
- **Tone**: warm, precise, a little playful. Second person. No exclamation
  marks in prompts. The verdicts can be witty and should be flavoured by the
  topic (an art deck says "museum-grade mastery", a cooking deck might say
  "Michelin material").
- **Facts must be true.** Prefer well-established facts over trivia that
  sources disagree on. If a number is disputed, pick a different card.

## Deck format

```jsonc
{
  "slug": "art-timeline",               // lowercase, dashes; namespaces saved scores
  "title": "Art Timeline",              // site name
  "headline": "Are you an Art connoisseur?", // the big question, as a question
  "tagline": "One timeline and a few art movements.",
  "intro": ["…", "…"],                  // 1–3 short paragraphs for the landing page
  "cta": "Test knowledge",              // button label
  "author": { "name": "@you", "url": "https://x.com/you" }, // optional
  "passScore": 7,                       // score needed to unlock the next level
  "timerSeconds": 20,                   // default countdown per card on timed levels
  "verdicts": {                         // results screen, by score band
    "low": "…",      // 30 % or less
    "mid": "…",      // up to 60 %
    "high": "…",     // above 60 %, not perfect
    "perfect": "…"   // full marks
  },
  "levels": [
    {
      "id": "student",                  // lowercase, dashes, unique
      "name": "Student",                // shown as "Student level"
      "tagline": "Famous names and masterpieces.",
      "timed": false,
      "timerSeconds": 10,               // optional per-level override
      "hidden": false,                  // true: only appears once the previous level is passed
      "questions": [
        {
          "kind": "choice",
          "id": "s1",                   // unique across the deck
          "prompt": "Who painted the Mona Lisa?",
          "options": ["Leonardo da Vinci", "Michelangelo", "Sandro Botticelli", "Caravaggio"],
          "fact": "The Mona Lisa is a Renaissance work — a period defined by realism, proportion, and perspective."
        },
        {
          "kind": "truefalse",
          "id": "s2",
          "statement": "Realism aimed to idealize its subjects.",
          "answer": false,
          "fact": "Realism (1840 – 1880) portrayed the world as it is — everyday subjects, with idealism avoided."
        },
        {
          "kind": "order",
          "id": "s3",
          "prompt": "Tap these movements in order, earliest first.",
          "items": [
            { "label": "Renaissance", "value": 1400 },
            { "label": "Baroque", "value": 1600 },
            { "label": "Impressionism", "value": 1860 }
          ],
          "fact": "Renaissance (1400 – 1600), then Baroque (1600 – 1700), then Impressionism (1860 – 1880)."
        }
      ]
    }
  ]
}
```

Rules the site enforces:

- `options[0]` is the correct answer. The site shuffles the options; you
  must not.
- `options` has 2 to 6 entries (4 is the sweet spot); `items` has 3 to 5.
- Question ids are unique across the whole deck; level ids are unique.
- `passScore` can't exceed the number of questions in a level.
- Images are optional. `image` shows sharp while answering ("which movement
  is this?"); `revealImage` shows blurred and sharpens with the answer. Only
  reference images you were given (a path under `/public`, like
  `/images/starry-night.jpg`, or an https URL). Never invent an image path.

## Output

Return only the JSON object, nothing else.
