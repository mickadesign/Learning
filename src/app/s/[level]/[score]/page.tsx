import type { Metadata } from "next";
import { DECK } from "@/data";
import { verdictFor } from "@/lib/deck";
import { HomeScreen } from "@/components/home-screen";

// Share pages exist so a posted score gets its own OG card (title, line, and
// the generated per-score image next door in opengraph-image.tsx). A human
// clicking the link just gets the regular site.
//
// Every level × score combination is prerendered; anything else 404s, so the
// whole tree — images included — stays static.
export const dynamicParams = false;

export function generateStaticParams() {
  return DECK.levels.flatMap((lv) =>
    Array.from({ length: lv.questions.length + 1 }, (_, score) => ({
      level: lv.id,
      score: String(score),
    }))
  );
}

interface ShareParams {
  params: Promise<{ level: string; score: string }>;
}

export async function generateMetadata({
  params,
}: ShareParams): Promise<Metadata> {
  const { level, score } = await params;
  const lv = DECK.levels.find((l) => l.id === level)!;
  const total = lv.questions.length;
  const title = `${score}/${total} on the ${lv.name} level — ${DECK.title}`;
  const description = `${verdictFor(DECK, Number(score), total)} Think you can beat it? ${DECK.tagline}`;
  return {
    title,
    description,
    openGraph: { title, description },
    // The generated OG image is picked up by file convention; X still needs
    // the card type to render it large.
    twitter: { card: "summary_large_image" },
  };
}

export default function SharePage() {
  return <HomeScreen />;
}
