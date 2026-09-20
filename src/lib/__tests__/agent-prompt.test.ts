import { describe, expect, it } from "vitest";
import { agentPrompt } from "@/lib/agent-prompt";

describe("agentPrompt", () => {
  const prompt = agentPrompt("https://flashcards.example");

  it("sends the agent to the page with the presence flag and the reference", () => {
    expect(prompt).toContain("https://flashcards.example/?agent");
    expect(prompt).toContain("https://flashcards.example/agents.md");
    expect(prompt).toContain("window.flashcards.call");
  });

  it("walks the tools in order and asks for picture hints, never URLs", () => {
    // The brief is short on purpose: it names the tools that bracket the
    // work and says "add ten cards" for the middle step.
    const order = ["get_flashcard_format", "start_flashcard_deck", "add ten cards", "publish_flashcard_deck"];
    const positions = order.map((t) => prompt.indexOf(t));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(prompt).toMatch(/picture: \{ wikipediaTitle, slot, alt \}/);
    expect(prompt).toMatch(/never write an image URL/);
  });

  it("stays short enough to ride in a deep link", () => {
    expect(encodeURIComponent(prompt).length).toBeLessThan(4000);
  });
});
