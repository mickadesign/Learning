// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getShareLink, setShareLink } from "@/lib/deck-store";
import { shareDeck, SharingUnavailable } from "@/lib/share";
import { choice, deckFixture } from "./fixtures";

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  localStorage.clear();
});

describe("shareDeck", () => {
  it("posts the deck once and stores the link it gets back", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, { id: "abc123", url: "https://site.test/d/abc123" }));
    vi.stubGlobal("fetch", fetchMock);
    const deck = deckFixture();
    await expect(shareDeck(deck)).resolves.toBe("https://site.test/d/abc123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/share");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body).slug).toBe("test-deck");
    expect(getShareLink(deck)).toBe("https://site.test/d/abc123");
  });

  it("returns a known link without a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const deck = deckFixture();
    setShareLink(deck, "https://site.test/d/known");
    await expect(shareDeck(deck)).resolves.toBe("https://site.test/d/known");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deduplicates concurrent requests for the same deck", async () => {
    let release: (r: Response) => void = () => {};
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>((r) => (release = r)));
    vi.stubGlobal("fetch", fetchMock);
    const deck = deckFixture();
    const a = shareDeck(deck);
    const b = shareDeck(deck);
    release(reply(200, { id: "x", url: "https://site.test/d/x" }));
    expect(await Promise.all([a, b])).toEqual(["https://site.test/d/x", "https://site.test/d/x"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives a deck that changed mid-upload its own request and link", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(200, { id: "old", url: "https://site.test/d/old" }))
      .mockResolvedValueOnce(reply(200, { id: "new", url: "https://site.test/d/new" }));
    vi.stubGlobal("fetch", fetchMock);
    const v1 = deckFixture();
    const v2 = deckFixture({ questions: [choice("one-1"), choice("one-2")] });
    const [a, b] = await Promise.all([shareDeck(v1), shareDeck(v2)]);
    expect([a, b]).toEqual(["https://site.test/d/old", "https://site.test/d/new"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getShareLink(v2)).toBe("https://site.test/d/new");
  });

  it("raises SharingUnavailable on a 503 and keeps nothing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(503, { error: "Sharing isn't set up on this deployment (no blob store)." })));
    const deck = deckFixture();
    await expect(shareDeck(deck)).rejects.toBeInstanceOf(SharingUnavailable);
    expect(getShareLink(deck)).toBeUndefined();
  });

  it("surfaces the server's message on other failures and retries next time", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(400, { error: "Invalid deck: levels: too small" }))
      .mockResolvedValueOnce(reply(200, { id: "y", url: "https://site.test/d/y" }));
    vi.stubGlobal("fetch", fetchMock);
    const deck = deckFixture();
    await expect(shareDeck(deck)).rejects.toThrow(/Invalid deck/);
    await expect(shareDeck(deck)).resolves.toBe("https://site.test/d/y");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("copes with a non-JSON error body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("gateway timeout", { status: 504 })));
    await expect(shareDeck(deckFixture())).rejects.toThrow(/Sharing failed \(504\)/);
  });
});
