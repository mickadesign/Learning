import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { cardPicture } from "@/lib/deck";
import { fetchPictureData, renderablePicture } from "@/lib/server/og-picture";
import { loadSharedDeck } from "@/lib/server/share";

// The card a shared deck's link unfurls with: the site's dark surface, the
// deck's headline in the serif, the card count, and up to three of its
// pictures as the same loose fan the quiz intro shows. The pictures are
// fetched here, from allowed hosts only and with a deadline, and handed to
// the renderer as data URIs (see og-picture.ts).

export const revalidate = 86400;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Flashcards";

const BG = "#171717";
const FG = "#FAFAFA";
const MUTED = "#A3A3A3";
const RING = "#2C2C2C";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deck = await loadSharedDeck(id);
  const [serif, sans] = await Promise.all([
    readFile(path.join(process.cwd(), "src/fonts/InstrumentSerif-Regular.ttf")),
    readFile(path.join(process.cwd(), "src/fonts/Inter-Medium.ttf")),
  ]);
  const fonts = [
    { name: "Serif", data: serif, weight: 400 as const, style: "normal" as const },
    { name: "Sans", data: sans, weight: 500 as const, style: "normal" as const },
  ];

  if (!deck) return new Response("Not found", { status: 404 });

  const cards = deck.levels.reduce((n, lv) => n + lv.questions.length, 0);
  const candidates = deck.levels
    .flatMap((lv) => lv.questions)
    .map(cardPicture)
    .map(renderablePicture)
    .filter((src): src is string => !!src)
    .slice(0, 3);
  const images = (await Promise.all(candidates.map((src) => fetchPictureData(src)))).filter(
    (data): data is string => !!data
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: BG,
          color: FG,
          padding: 72,
          fontFamily: "Sans",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            flexGrow: 1,
            paddingRight: 48,
          }}
        >
          <div style={{ display: "flex", fontFamily: "Serif", fontSize: 44 }}>{deck.title}</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontFamily: "Serif",
                fontSize: 84,
                lineHeight: 1.05,
                maxWidth: 640,
              }}
            >
              {deck.headline}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 30,
                lineHeight: 1.4,
                color: MUTED,
                marginTop: 24,
                maxWidth: 560,
              }}
            >
              {deck.tagline}
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 27, color: MUTED }}>
            {cards} {cards === 1 ? "flashcard" : "flashcards"}. Open the link to play.
          </div>
        </div>

        {images.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              width: 400,
              flexShrink: 0,
            }}
          >
            {images.map((src, i) => (
              <img
                key={i}
                src={src}
                alt=""
                width={360}
                height={250}
                style={{
                  objectFit: "cover",
                  borderRadius: 16,
                  border: `6px solid ${RING}`,
                  transform: `rotate(${[-5, 4, -2][i]}deg)`,
                  marginTop: i > 0 ? -70 : 0,
                  marginLeft: [0, 30, 10][i],
                }}
              />
            ))}
          </div>
        )}
      </div>
    ),
    { ...size, fonts }
  );
}
