import { beforeEach, describe, expect, it, vi } from "vitest";
import { choice, rawDeck } from "@/lib/__tests__/fixtures";

vi.mock("@/lib/server/share", () => ({
  MAX_DECK_BYTES: 400_000,
  sharingAvailable: vi.fn(() => true),
  storeSharedDeck: vi.fn(async () => "abcdefghjk"),
}));

import { sharingAvailable, storeSharedDeck } from "@/lib/server/share";
import { GET, POST } from "./route";

const available = vi.mocked(sharingAvailable);
const store = vi.mocked(storeSharedDeck);

function post(body: unknown, headers: Record<string, string> = {}, ip = "203.0.113.1") {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return POST(
    new Request("http://localhost/api/share", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip, ...headers },
      body: text,
    })
  );
}

beforeEach(() => {
  available.mockReturnValue(true);
  store.mockResolvedValue("abcdefghjk");
});

describe("GET /api/share", () => {
  it("says whether sharing is available", async () => {
    expect(await GET().json()).toEqual({ available: true });
    available.mockReturnValue(false);
    expect(await GET().json()).toEqual({ available: false });
  });
});

describe("POST /api/share", () => {
  it("stores a valid deck and answers with a link on the request's public host", async () => {
    const res = await post(rawDeck(), { "x-forwarded-host": "flashcards.example", "x-forwarded-proto": "https" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "abcdefghjk", url: "https://flashcards.example/d/abcdefghjk" });
    expect(store).toHaveBeenCalledTimes(1);
    expect(store.mock.calls[0][0].slug).toBe("raw-deck");
  });

  it("uses http for localhost when no proxy headers are present", async () => {
    const res = await post(rawDeck(), { host: "localhost:3000" }, "203.0.113.2");
    expect((await res.json()).url).toBe("http://localhost:3000/d/abcdefghjk");
  });

  it("is 503 without a blob store and stores nothing", async () => {
    available.mockReturnValue(false);
    const res = await post(rawDeck(), {}, "203.0.113.3");
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/isn't set up/);
    expect(store).not.toHaveBeenCalled();
  });

  it("is 400 for a deck that fails the schema, naming the path", async () => {
    const res = await post(rawDeck({ levels: [] }), {}, "203.0.113.4");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid deck:\s+levels/);
    expect(store).not.toHaveBeenCalled();
  });

  it("is 400 for a body that isn't JSON", async () => {
    const res = await post("{nope", {}, "203.0.113.5");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not JSON/);
  });

  it("is 413 when the declared or actual size is over the cap", async () => {
    const declared = await post(rawDeck(), { "content-length": String(10_000_000) }, "203.0.113.6");
    expect(declared.status).toBe(413);
    const huge = rawDeck({ tagline: "x".repeat(500_000) });
    const actual = await post(huge, {}, "203.0.113.7");
    expect(actual.status).toBe(413);
    expect(store).not.toHaveBeenCalled();
  });

  it("takes the first address of a forwarded chain and falls back to a shared key", async () => {
    const chain = "203.0.113.50, 10.0.0.1";
    for (let i = 0; i < 30; i++) expect((await post(rawDeck(), {}, chain)).status).toBe(200);
    expect((await post(rawDeck(), {}, "203.0.113.50")).status).toBe(429);
    const noHeader = await POST(new Request("http://localhost/api/share", { method: "POST", body: JSON.stringify(rawDeck()) }));
    expect(noHeader.status).toBe(200);
  });

  it("measures the cap in bytes, not characters", async () => {
    // 150 k four-byte characters: 150 k code points, 600 KB on the wire.
    const emoji = "\u{1F600}".repeat(150_000);
    const res = await post(rawDeck({ tagline: emoji }), {}, "203.0.113.8");
    expect(res.status).toBe(413);
  });

  it("answers 502 when the store fails, without leaking the error", async () => {
    store.mockRejectedValueOnce(new Error("blob: token revoked"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post(rawDeck(), {}, "203.0.113.9");
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/Try again/);
    expect(body.error).not.toMatch(/token/);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("stores the normalised deck, with unknown keys stripped", async () => {
    await post(rawDeck({ extra: "junk", levels: [{ id: "l", name: "L", tagline: "t", questions: [{ ...choice("l-1"), picture: { wikipediaTitle: "x" } }] }] }), {}, "203.0.113.10");
    const stored = store.mock.calls.at(-1)![0] as unknown as Record<string, unknown>;
    expect("extra" in stored).toBe(false);
    expect("picture" in (stored.levels as { questions: object[] }[])[0].questions[0]).toBe(false);
  });

  it("rate-limits an address after thirty decks in an hour", async () => {
    const ip = "203.0.113.99";
    for (let i = 0; i < 30; i++) expect((await post(rawDeck(), {}, ip)).status).toBe(200);
    const blocked = await post(rawDeck(), {}, ip);
    expect(blocked.status).toBe(429);
    expect((await post(rawDeck(), {}, "203.0.113.100")).status).toBe(200);
  });
});
