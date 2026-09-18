# Deck format

The deck is `src/data/deck.json`. The schema lives in
[`src/lib/deck.ts`](../src/lib/deck.ts); this page is the human version. The
brief agents follow when writing one is [`prompts/new-deck.md`](../prompts/new-deck.md).

## Deck

| Field | Type | Notes |
| --- | --- | --- |
| `slug` | string | Lowercase and dashes. Namespaces saved scores and the theme preference, and appears in share URLs. |
| `title` | string | Site name: browser tab, share cards, share text. |
| `headline` | string | The big question on the landing page and the level list, e.g. "Are you an Art connoisseur?" |
| `tagline` | string | One line for metadata and share cards. |
| `intro` | string[] | Optional. Short paragraphs on the landing page. |
| `cta` | string | Optional. Button label, default "Test knowledge". |
| `author` | `{ name, url? }` | Optional. Credit line on the landing page and level list. |
| `passScore` | number | Optional, default 7. Score needed on a level to unlock the next. |
| `timerSeconds` | number | Optional, default 20. Countdown per card on timed levels. |
| `verdicts` | `{ low, mid, high, perfect }` | Results-screen line by score band: ≤ 30 %, ≤ 60 %, < 100 %, 100 %. |
| `levels` | Level[] | In play order. |

## Level

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Lowercase and dashes, unique. Appears in share URLs (`/s/<id>/<score>`). |
| `name` | string | Shown as "<name> level". |
| `tagline` | string | One line under the name on the level card. |
| `timed` | boolean | Optional. Runs each card against a countdown ring. |
| `timerSeconds` | number | Optional. Overrides the deck default for this level. |
| `hidden` | boolean | Optional. Only appears once the previous level is passed, with the golden beam. |
| `questions` | Question[] | The reference deck uses 10; the results screen shows `score/<count>`. |

## Questions

All kinds share `id` (unique across the deck) and `fact` (one line shown on the
reveal, whatever the answer).

**choice** — `prompt`, `options` (2–6 strings, **the first one is correct**;
the site shuffles), optional `image` (shown sharp while answering) or
`revealImage` (shown blurred, sharpened with the answer), optional `imageAlt`.

**truefalse** — `statement`, `answer` (boolean), optional `revealImage` and
`imageAlt`. Players answer with keys 1 (true) and 2 (false).

**order** — `prompt`, `items` (3–5 of `{ label, value }`, listed lowest value
first; the site shuffles and the player taps them back into ascending order).
The value shows on the reveal, so pick something meaningful: a year, a
height, a rank.

## Images

Paths are relative to `public/` (`/images/starry-night.jpg`) or absolute
`https://` URLs. Local PNG/JPEG images also feed the share cards' image fan;
remote and WebP images are skipped there. The landing page's hover fan and
each level card's teaser take the first `choice` questions that have an
`image`.

## Validation

```bash
npm run check-deck            # src/data/deck.json
npm run check-deck -- x.json  # any file
```

Errors (schema violations, duplicate ids, a pass score higher than the card
count) fail the build too. Warnings point at things the reference deck does
differently (card counts, single-kind levels, missing image files).
