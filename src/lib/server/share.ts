// Shared decks live in Vercel Blob as `decks/<id>.json`: a deck written in
// one browser gets a short link (/d/<id>) anyone can open. Public blobs,
// random ids, no index — the id in the link is the only way to find one.
// Used by the /api/share route (write) and the /d/[id] page (read).

import { get, put } from "@vercel/blob";
import { parseDeck, type Deck } from "../deck";

const PREFIX = "decks/";
/** A deck JSON larger than this is refused: forty cards with credits run
 *  to about 40 KB, so this is ten times a full deck. */
export const MAX_DECK_BYTES = 400_000;

/** Whether this deployment can store shared decks. */
export function sharingAvailable(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ID = /^[A-Za-z0-9]{10,16}$/;

/** Ten characters from an unambiguous alphabet: ~58 bits, enough that ids
 *  never collide in practice and can't be guessed. */
export function newShareId(): string {
  // Rejection sampling keeps every character equally likely (256 isn't a
  // multiple of the alphabet's 56).
  const limit = 256 - (256 % ALPHABET.length);
  let id = "";
  while (id.length < 10) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b < limit && id.length < 10) id += ALPHABET[b % ALPHABET.length];
    }
  }
  return id;
}

/** Store a validated deck and return its id. */
export async function storeSharedDeck(deck: Deck): Promise<string> {
  const id = newShareId();
  await put(`${PREFIX}${id}.json`, JSON.stringify(deck), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    // Decks never change once shared (a new version gets a new id), so the
    // CDN can hold them for as long as it likes.
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });
  return id;
}

/** The deck behind an id, or null when the id is malformed, unknown, or
 *  the stored JSON no longer passes the schema. */
export async function loadSharedDeck(id: string): Promise<Deck | null> {
  if (!ID.test(id) || !sharingAvailable()) return null;
  const result = await get(`${PREFIX}${id}.json`, { access: "public" }).catch(() => null);
  if (!result || result.statusCode !== 200) return null;
  try {
    const text = await new Response(result.stream).text();
    return parseDeck(JSON.parse(text));
  } catch {
    return null;
  }
}
