"use client";

import { Button } from "@/components/ui/button";
import { ShareLinkButton } from "@/components/share-link-button";
import type { Deck } from "@/lib/deck";

// ── The decks on this page ──────────────────────────────────
// The built-in deck and the ones written in this browser, each on the same
// line as the status line below them: the title, the link icon that copies
// the deck's share link, and the same Play button. Shown under the headline
// once there is more than one deck to choose from.

interface DeckListProps {
  decks: Deck[];
  /** The built-in deck's slug: its share link is the site itself. */
  builtInSlug: string;
  onPlay: (slug: string) => void;
}

export function DeckList({ decks, builtInSlug, onPlay }: DeckListProps) {
  return (
    <ul className="space-y-3">
      {decks.map((deck) => (
        <li
          key={deck.slug}
          className="flex min-h-9 items-center gap-3 text-[14px] leading-snug text-foreground"
        >
          <span className="truncate text-[16px]">{deck.title}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <ShareLinkButton deck={deck} builtIn={deck.slug === builtInSlug} />
            <Button
              variant="primary"
              size="lg"
              className="rounded-full"
              onClick={() => onPlay(deck.slug)}
            >
              Play
            </Button>
          </span>
        </li>
      ))}
    </ul>
  );
}
