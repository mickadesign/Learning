import { NextResponse } from "next/server";
import { parseDeck } from "@/lib/deck";
import { MAX_DECK_BYTES, sharingAvailable, storeSharedDeck } from "@/lib/server/share";

// Share a deck: POST the deck JSON, get back a short link. The deck is
// validated with the same schema the site uses everywhere, capped in size,
// and stored under a random id. Anyone can call this — there are no
// accounts — so a modest per-address rate limit keeps a loop from filling
// the store. (Per instance: serverless functions don't share memory, so
// it's a brake, not a wall.)

const WINDOW_MS = 60 * 60 * 1000;
const PER_WINDOW = 30;
const recent = new Map<string, number[]>();

function limited(ip: string): boolean {
  const now = Date.now();
  // Forget addresses whose window has passed, so the map can't grow
  // without bound on a long-lived instance.
  if (recent.size > 1000)
    for (const [addr, hits] of recent) if (hits.every((t) => now - t >= WINDOW_MS)) recent.delete(addr);
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  recent.set(ip, hits);
  return hits.length > PER_WINDOW;
}

/** The public origin, behind Vercel's proxy or on localhost. */
function originOf(req: Request): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Whether this deployment can share decks, so the page and the tools can
 *  say so before anyone tries. */
export function GET() {
  return NextResponse.json({ available: sharingAvailable() });
}

export async function POST(req: Request) {
  if (!sharingAvailable())
    return NextResponse.json(
      { error: "Sharing isn't set up on this deployment (no blob store)." },
      { status: 503 }
    );
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip))
    return NextResponse.json({ error: "Too many decks shared from this address. Try again later." }, { status: 429 });
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_DECK_BYTES)
    return NextResponse.json({ error: "That deck is too large to share." }, { status: 413 });
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_DECK_BYTES)
    return NextResponse.json({ error: "That deck is too large to share." }, { status: 413 });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid deck: not JSON." }, { status: 400 });
  }
  let deck;
  try {
    deck = parseDeck(raw);
  } catch (error) {
    // parseDeck already lists the issues by path ("Invalid deck:\n  path: …").
    const message = error instanceof Error ? error.message : "Invalid deck.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  let id: string;
  try {
    id = await storeSharedDeck(deck);
  } catch (error) {
    console.error("share: could not store the deck", error);
    return NextResponse.json({ error: "Couldn't store the deck right now. Try again in a moment." }, { status: 502 });
  }
  return NextResponse.json({ id, url: `${originOf(req)}/d/${id}` });
}
