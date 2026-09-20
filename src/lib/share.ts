// Sharing a deck from the browser: POST it to /api/share once, keep the
// short link next to the deck in local storage, and hand the same link back
// for as long as the deck hasn't changed. One request per deck, even when
// the quiz and an agent ask at the same time.

import type { Deck } from "./deck";
import { deckFingerprint, getShareLink, setShareLink } from "./deck-store";

/** This deployment has no blob store: nothing to do but say so. */
export class SharingUnavailable extends Error {}

const inFlight = new Map<string, Promise<string>>();

/** The deck's share link — stored, in flight, or freshly made. */
export function shareDeck(deck: Deck): Promise<string> {
  const known = getShareLink(deck);
  if (known) return Promise.resolve(known);
  // Keyed by content: a deck that changed while its old version was still
  // uploading gets its own link, not the old one.
  const key = `${deck.slug}:${deckFingerprint(deck)}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const run = (async () => {
    const res = await fetch("/api/share", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(deck),
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (res.status === 503)
      throw new SharingUnavailable(data.error ?? "Sharing isn't set up on this deployment.");
    if (!res.ok || !data.url) throw new Error(data.error ?? `Sharing failed (${res.status}).`);
    setShareLink(deck, data.url);
    return data.url;
  })().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, run);
  return run;
}
