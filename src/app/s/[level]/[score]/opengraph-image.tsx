import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { DECK } from "@/data";
import { verdictFor, type ChoiceQuestion } from "@/lib/deck";

// Per-score OG card for the quiz share pages: the site's dark surface, the
// serif score, and the level's image fan (the same prints its level card
// teases). Generated at build time for every level × score via the page's
// generateStaticParams, so satori/resvg never run in production.

// Image routes need their own static params to prerender (the page's don't
// carry over). Same level × score grid as page.tsx.
export const dynamicParams = false;

export function generateStaticParams() {
  return DECK.levels.flatMap((lv) =>
    Array.from({ length: lv.questions.length + 1 }, (_, score) => ({
      level: lv.id,
      score: String(score),
    }))
  );
}

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${DECK.title} quiz score`;

// Satori palette — the dark theme's surface/foreground/muted tokens, resolved
// to hex because the CSS variables don't exist here.
const BG = "#171717";
const FG = "#FAFAFA";
const MUTED = "#A3A3A3";
const RING = "#2C2C2C";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

/** Local png/jpeg under /public only: satori has no webp support and the
 *  build has no network for remote images. */
function embeddable(src: string | undefined): src is string {
  return !!src && src.startsWith("/") && path.extname(src) in MIME;
}

export default async function Image({
  params,
}: {
  params: Promise<{ level: string; score: string }>;
}) {
  const { level, score } = await params;
  const lv = DECK.levels.find((l) => l.id === level)!;
  const n = Number(score);
  const total = lv.questions.length;

  const [serif, sans] = await Promise.all([
    readFile(path.join(process.cwd(), "src/fonts/InstrumentSerif-Regular.ttf")),
    readFile(path.join(process.cwd(), "src/fonts/Inter-Medium.ttf")),
  ]);

  // The level's image teasers, embedded as data URIs (no network at build
  // time).
  const images = await Promise.all(
    lv.questions
      .filter(
        (q): q is ChoiceQuestion => q.kind === "choice" && embeddable(q.image)
      )
      .slice(0, 3)
      .map(async (q) => {
        const file = await readFile(path.join(process.cwd(), "public", q.image!));
        return `data:${MIME[path.extname(q.image!)]};base64,${file.toString("base64")}`;
      })
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
        {/* Left column: masthead → score block → quiz tease. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            flexGrow: 1,
          }}
        >
          <div style={{ display: "flex", fontFamily: "Serif", fontSize: 44 }}>
            {DECK.title}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                fontFamily: "Serif",
              }}
            >
              <span style={{ fontSize: 220, lineHeight: 0.85 }}>{n}</span>
              <span style={{ fontSize: 90, lineHeight: 1, color: MUTED }}>
                /{total}
              </span>
            </div>
            <div style={{ display: "flex", fontSize: 46, marginTop: 28 }}>
              {lv.name} level
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 28,
                lineHeight: 1.4,
                color: MUTED,
                marginTop: 12,
                maxWidth: 560,
              }}
            >
              {verdictFor(DECK, n, total)}
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 27, color: MUTED }}>
            {DECK.headline} Take the quiz.
          </div>
        </div>

        {/* Right: the loose overlapping print fan from the level cards. */}
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
            /* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */
            <img
              key={i}
              src={src}
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
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Serif", data: serif, weight: 400, style: "normal" },
        { name: "Sans", data: sans, weight: 500, style: "normal" },
      ],
    }
  );
}
