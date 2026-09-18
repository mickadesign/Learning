import { NextResponse } from "next/server";
import { z } from "zod";
import {
  GenerationRefused,
  generationAvailable,
  planDeck,
} from "@/lib/server/generate";

// Planning is a short request; the ceiling is for slow days.
export const maxDuration = 60;

const Body = z.object({
  topic: z.string().trim().min(2).max(120),
  notes: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  if (!generationAvailable())
    return NextResponse.json(
      { error: "Deck generation isn't configured on this deployment." },
      { status: 503 }
    );
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json({ error: "Give me a topic (2–120 characters)." }, { status: 400 });
  try {
    const plan = await planDeck(body.data.topic, { notes: body.data.notes });
    return NextResponse.json({ plan });
  } catch (error) {
    if (error instanceof GenerationRefused)
      return NextResponse.json({ error: error.message }, { status: 422 });
    console.error("plan failed", error);
    return NextResponse.json(
      { error: "Couldn't plan the deck. Try again in a moment." },
      { status: 500 }
    );
  }
}
