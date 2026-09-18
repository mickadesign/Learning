/** The brief handed to an AI agent by the "Copy agent prompt" button: open
 *  this site, ask the visitor what they want to learn, write ten cards
 *  through the WebMCP tools, then iterate. Self-contained, so it works in
 *  any agent that can browse and call page tools. */
export function agentPrompt(origin: string): string {
  return `Open ${origin}/ in your browser and keep the page open. The moment it loads it registers WebMCP tools on document.modelContext (the reference is ${origin}/agents.md); use those tools rather than clicking through the page. If you have no way to open a web page and call its tools, say so and stop.

Then:
1. Ask me one question — what would I like to learn? — and wait for my answer.
2. Call get_flashcard_format once. Then write a first set of 10 cards about my topic: start_flashcard_deck (a title, a headline phrased as a question, a tagline, four verdicts, and a single level), add_flashcards with the 10 cards (about six choice with options[0] correct, two truefalse, one or two order, every card with a one-line fact that teaches something), then publish_flashcard_deck so the quiz opens for me.
3. Tell me it's ready in one line and let me play. Then iterate: ask what I'd like changed — harder, easier, a different angle, another level — and use get_flashcard_deck, add_flashcards or a new start_flashcard_deck, and publish_flashcard_deck again. Keep every fact true; if you're unsure of one, pick a different card.`;
}
