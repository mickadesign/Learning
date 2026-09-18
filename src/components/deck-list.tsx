"use client";

import { Button } from "@/components/ui/button";
import type { Deck } from "@/lib/deck";

// ── The decks on this page ──────────────────────────────────
// The built-in deck and the ones written in this browser, each on the same
// line as the status line below them: the title, and the same Play button.
// Shown under the headline once there is more than one deck to choose from.

interface DeckListProps {
  decks: Deck[];
  onPlay: (slug: string) => void;
}

export function DeckList({ decks, onPlay }: DeckListProps) {
  return (
    <ul className="space-y-3">
      {decks.map((deck) => (
        <li
          key={deck.slug}
          className="flex min-h-[28px] items-center gap-3 text-[14px] leading-snug text-foreground"
        >
          <span className="truncate">{deck.title}</span>
          <Button
            variant="secondary"
            size="sm"
            className="ml-auto shrink-0 rounded-full"
            onClick={() => onPlay(deck.slug)}
          >
            Play
          </Button>
        </li>
      ))}
    </ul>
  );
}
