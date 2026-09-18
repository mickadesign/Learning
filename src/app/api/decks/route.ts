import { NextResponse } from "next/server";
import { MODEL, generationAvailable } from "@/lib/server/generate";

/** Whether this deployment can write decks, so the landing page knows what
 *  to offer before anyone types. */
export function GET() {
  const available = generationAvailable();
  return NextResponse.json({ available, model: available ? MODEL : null });
}
