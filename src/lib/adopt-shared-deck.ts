// A deck that arrived through its share link (/d/<id>) joins this browser's
// collection: under its own slug when that is free or already holds the
// same deck, under a fresh one when a different deck lives there. Either
// way the link it came from is remembered against the saved copy, so the
// results screen can hand it on without a second upload.

import type { Deck } from "./deck";
import { deckFingerprint, getSavedDeck, listSavedDecks, saveDeck, setShareLink, uniqueSlug } from "./deck-store";

export interface SharedDeck {
  deck: Deck;
  id: string;
}

/** Save (or recognise) the shared deck and return the copy to open. Reads
 *  the store directly rather than any React snapshot of it, so a deck saved
 *  moments ago — or before this page hydrated — is never overlooked. */
export function adoptSharedDeck(shared: SharedDeck, builtIn: Deck, origin: string): Deck {
  let deck = shared.deck;
  const existing = deck.slug === builtIn.slug ? builtIn : getSavedDeck(deck.slug);
  if (existing && deckFingerprint(existing) !== deckFingerprint(deck)) {
    const taken = [builtIn.slug, ...listSavedDecks().map((d) => d.slug)];
    deck = { ...deck, slug: uniqueSlug(deck.slug, taken) };
  }
  const isBuiltIn = deck.slug === builtIn.slug;
  if (!isBuiltIn && (!existing || deck.slug !== shared.deck.slug)) saveDeck(deck);
  setShareLink(deck, `${origin}/d/${shared.id}`);
  return deck;
}
