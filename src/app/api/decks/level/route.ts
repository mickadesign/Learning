import { NextResponse } from "next/server";
import { z } from "zod";
import { DeckPlanSchema } from "@/lib/deck";
import {
  GenerationRefused,
  generationAvailable,
  writeLevel,
} from "@/lib/server/generate";

// Writing ten cards with thinking on can take a minute on a slow day.
export const maxDuration = 120;

const Body = z.object({
  topic: z.string().trim().min(2).max(120),
  plan: DeckPlanSchema,
  levelId: z.string(),
  avoid: z.array(z.string().max(300)).max(200).default([]),
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
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  const { topic, plan, levelId, avoid, notes } = body.data;
  const level = plan.levels.find((l) => l.id === levelId);
  if (!level)
    return NextResponse.json({ error: `No level "${levelId}" in the plan.` }, { status: 400 });
  try {
    const questions = await writeLevel({ topic, plan, level, avoid, notes });
    return NextResponse.json({ questions });
  } catch (error) {
    if (error instanceof GenerationRefused)
      return NextResponse.json({ error: error.message }, { status: 422 });
    console.error("level failed", error);
    return NextResponse.json(
      { error: `Couldn't write the ${level.name} level. Try again in a moment.` },
      { status: 500 }
    );
  }
}
