"use client";

import { useMemo } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import type { Deck } from "@/lib/deck";

/** Starter topics, so the list is never empty and the create row has
 *  company. Picking one writes a deck about it. */
export const TOPIC_IDEAS = [
  "The French Revolution",
  "How the immune system works",
  "Coffee brewing",
  "The Solar System",
  "Chess openings",
  "Bauhaus design",
];

interface TopicItem {
  value: string;
  label: string;
  hint: string;
  kind: "deck" | "idea";
}

interface TopicComboboxProps {
  /** Decks ready to play, built-in first. */
  decks: Deck[];
  /** Whether this deployment can write new decks. Without it the create row
   *  and the ideas stay out of the list. */
  canCreate: boolean;
  disabled?: boolean;
  onPlay: (slug: string) => void;
  onCreate: (topic: string) => void;
}

/** The one question on the landing page, as a borderless combobox: pick a
 *  deck to play, or type any topic and press Enter to have one written. */
export function TopicCombobox({
  decks,
  canCreate,
  disabled,
  onPlay,
  onCreate,
}: TopicComboboxProps) {
  const items = useMemo<TopicItem[]>(
    () => [
      ...decks.map((d) => ({
        value: `deck:${d.slug}`,
        label: d.title,
        hint: "Play",
        kind: "deck" as const,
      })),
      ...(canCreate
        ? TOPIC_IDEAS.map((t) => ({
            value: `idea:${t}`,
            label: t,
            hint: "Write a deck",
            kind: "idea" as const,
          }))
        : []),
    ],
    [decks, canCreate]
  );

  return (
    <Combobox
      items={items}
      value=""
      disabled={disabled}
      onValueChange={(value) => {
        const item = items.find((i) => i.value === value);
        if (!item) return;
        if (item.kind === "deck") onPlay(item.value.slice("deck:".length));
        else onCreate(item.label);
      }}
      onCreate={canCreate ? (query) => void onCreate(query) : undefined}
      createLabel={(query) => `Write a deck about “${query}”`}
    >
      <ComboboxInput
        variant="borderless"
        placeholder={canCreate ? "Type a topic, or pick a deck" : "Pick a deck"}
        aria-label="What topic are you interested in learning?"
        className="w-full"
        autoComplete="off"
      />
      <ComboboxContent>
        <ComboboxEmpty>
          {canCreate ? "Press Enter to write a deck about it." : "No deck by that name."}
        </ComboboxEmpty>
        <ComboboxList>
          {(item) => {
            const t = item as TopicItem;
            return (
              <ComboboxItem key={t.value} value={t.value}>
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate">{t.label}</span>
                  <span className="shrink-0 text-[12px] text-muted-foreground">
                    {t.hint}
                  </span>
                </span>
              </ComboboxItem>
            );
          }}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
