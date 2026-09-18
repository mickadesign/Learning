// The active deck. Swap the JSON (or run `npm run generate -- "<topic>"`) to
// turn this site into a quiz about anything.
import raw from "./deck.json";
import { parseDeck } from "@/lib/deck";

export const DECK = parseDeck(raw);
