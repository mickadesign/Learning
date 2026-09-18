/** The brief handed to an AI agent by the "Copy agent prompt" button: open
 *  this site, suggest topics from what it knows about the visitor, write
 *  ten cards through the WebMCP tools, then iterate. Short on purpose — it
 *  also rides in deep-link URLs — and self-contained, so it works in any
 *  agent that can browse and call page tools. */
export function agentPrompt(origin: string): string {
  return `Open ${origin}/?agent and keep it open. The page gives you WebMCP tools on document.modelContext (reference: ${origin}/agents.md). If you can only run page scripts, use \`await window.flashcards.call("<tool>", { ...args })\`. Use the tools, not the UI.

1. Suggest three topics from what you know about me — things I care about but haven't gone deep on, one line each, no private details — or let me name my own. Wait for my pick.
2. Read get_flashcard_format, then start_flashcard_deck and add ten cards: mostly choice, a couple of true/false, one order, a one-line fact on each. On every card about something you can look at (a work, a building, a species, an object, a place) put picture: { wikipediaTitle, slot, alt } with the exact English Wikipedia article title — the site fetches and credits the picture; never write an image URL. publish_flashcard_deck.
3. Tell me it's ready in one line. Then iterate with me: harder, easier, another angle, another level. Every fact true — if unsure, swap the card.`;
}
