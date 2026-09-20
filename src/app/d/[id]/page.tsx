import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadSharedDeck } from "@/lib/server/share";
import { HomeScreen } from "@/components/home-screen";

// A shared deck's page: /d/<id> loads the deck from the blob store, saves
// it into the visitor's browser next to their own decks, and opens the
// quiz on it. The metadata and the generated card next door make the link
// unfurl with the deck's own headline and pictures.

// A shared deck never changes (a new version gets a new id), so a rendered
// page can be kept; a day keeps the store quiet under unfurl bots.
export const revalidate = 86400;

/** The metadata and the page both need the deck: one read per request. */
const load = cache(loadSharedDeck);

interface SharedParams {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: SharedParams): Promise<Metadata> {
  const { id } = await params;
  const deck = await load(id);
  if (!deck) return { title: "Deck not found" };
  const cards = deck.levels.reduce((n, lv) => n + lv.questions.length, 0);
  const title = `${deck.headline} — ${deck.title}`;
  const description = `${cards} ${cards === 1 ? "flashcard" : "flashcards"}. ${deck.tagline}`;
  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { card: "summary_large_image" },
  };
}

export default async function SharedDeckPage({ params }: SharedParams) {
  const { id } = await params;
  const deck = await load(id);
  if (!deck) notFound();
  return <HomeScreen shared={{ deck, id }} />;
}
