import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deckFixture } from "./fixtures";

vi.mock("@vercel/blob", () => ({ put: vi.fn(), get: vi.fn() }));

import { get, put } from "@vercel/blob";
import { loadSharedDeck, MAX_DECK_BYTES, newShareId, sharingAvailable, storeSharedDeck } from "@/lib/server/share";

const putMock = vi.mocked(put);
const getMock = vi.mocked(get);

beforeEach(() => {
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
});
afterEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
});

function blobResult(text: string, statusCode = 200) {
  return { statusCode, stream: new Response(text).body } as unknown as Awaited<ReturnType<typeof get>>;
}

describe("sharingAvailable", () => {
  it("follows the blob token", () => {
    expect(sharingAvailable()).toBe(true);
    delete process.env.BLOB_READ_WRITE_TOKEN;
    expect(sharingAvailable()).toBe(false);
  });
});

describe("newShareId", () => {
  it("is ten unambiguous characters and does not repeat", () => {
    const ids = new Set(Array.from({ length: 500 }, newShareId));
    expect(ids.size).toBe(500);
    for (const id of ids) {
      expect(id).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{10}$/);
      expect(id).not.toMatch(/[0OIl1]/);
    }
  });
});

describe("storeSharedDeck", () => {
  it("writes the deck JSON as a public, long-cached blob under decks/<id>.json", async () => {
    putMock.mockResolvedValue({} as never);
    const deck = deckFixture();
    const id = await storeSharedDeck(deck);
    expect(putMock).toHaveBeenCalledTimes(1);
    const [pathname, body, options] = putMock.mock.calls[0];
    expect(pathname).toBe(`decks/${id}.json`);
    expect(JSON.parse(body as string).slug).toBe("test-deck");
    expect(options).toMatchObject({ access: "public", contentType: "application/json", addRandomSuffix: false });
    expect(options.cacheControlMaxAge).toBeGreaterThanOrEqual(60 * 60 * 24 * 30);
  });

  it("keeps the size cap large enough for a full deck", () => {
    expect(MAX_DECK_BYTES).toBeGreaterThan(100_000);
  });
});

describe("loadSharedDeck", () => {
  it("rejects malformed ids without touching the store", async () => {
    for (const bad of ["", "short", "../etc/passwd", "a".repeat(40), "with space"]) {
      expect(await loadSharedDeck(bad)).toBeNull();
    }
    expect(getMock).not.toHaveBeenCalled();
  });

  it("is null when sharing is off, even for a well-formed id", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    expect(await loadSharedDeck("abcdefghjk")).toBeNull();
    expect(getMock).not.toHaveBeenCalled();
  });

  it("returns the parsed deck for a stored id", async () => {
    getMock.mockResolvedValue(blobResult(JSON.stringify(deckFixture())));
    const deck = await loadSharedDeck("abcdefghjk");
    expect(deck?.title).toBe("Test deck");
    expect(getMock).toHaveBeenCalledWith("decks/abcdefghjk.json", { access: "public" });
  });

  it("is null for an unknown id, a store error, or a blob that isn't a deck", async () => {
    getMock.mockResolvedValueOnce(null);
    expect(await loadSharedDeck("abcdefghjk")).toBeNull();
    getMock.mockRejectedValueOnce(new Error("network"));
    expect(await loadSharedDeck("abcdefghjk")).toBeNull();
    getMock.mockResolvedValueOnce(blobResult("{ not json"));
    expect(await loadSharedDeck("abcdefghjk")).toBeNull();
    getMock.mockResolvedValueOnce(blobResult(JSON.stringify({ slug: "x", title: "no levels" })));
    expect(await loadSharedDeck("abcdefghjk")).toBeNull();
    getMock.mockResolvedValueOnce(blobResult("", 304));
    expect(await loadSharedDeck("abcdefghjk")).toBeNull();
  });
});
