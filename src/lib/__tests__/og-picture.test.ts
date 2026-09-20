import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPictureData, renderablePicture } from "@/lib/server/og-picture";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("renderablePicture", () => {
  it("accepts https png/jpeg on the Wikimedia hosts only", () => {
    expect(renderablePicture("https://upload.wikimedia.org/wikipedia/commons/a/ab/Foo.jpg")).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/a/ab/Foo.jpg"
    );
    expect(renderablePicture("https://commons.wikimedia.org/wiki/Special:FilePath/Foo.png")).toMatch(/^https:\/\/commons/);
    expect(renderablePicture("https://UPLOAD.WIKIMEDIA.ORG/x/Foo.JPEG")).toMatch(/Foo\.JPEG$/);
    expect(renderablePicture("https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Foo.jpg/800px-Foo.jpg")).toMatch(/^https:\/\/thumb/);
  });

  it("refuses other hosts, other protocols, local paths, other formats, and junk", () => {
    for (const bad of [
      undefined,
      "",
      "/images/starry-night.jpg",
      "http://upload.wikimedia.org/x/Foo.jpg",
      "https://example.com/Foo.jpg",
      "https://10.0.0.5/internal.png",
      "https://upload.wikimedia.org.evil.test/Foo.jpg",
      "https://upload.wikimedia.org/x/Foo.webp",
      "https://upload.wikimedia.org/x/Foo.svg",
      "data:image/png;base64,AAAA",
      "javascript:alert(1)",
      "not a url",
    ]) {
      expect(renderablePicture(bad), String(bad)).toBeNull();
    }
  });
});

describe("fetchPictureData", () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]) as Uint8Array<ArrayBuffer>;
  const ok = (body: Uint8Array<ArrayBuffer> | null, headers: Record<string, string> = {}, status = 200) =>
    new Response(body ? new Blob([body]) : null, { status, headers: { "content-type": "image/png", ...headers } });

  it("returns a data URI for an allowed picture", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(png)));
    const data = await fetchPictureData("https://upload.wikimedia.org/x/Foo.png");
    expect(data).toBe(`data:image/png;base64,${Buffer.from(png).toString("base64")}`);
  });

  it("never fetches a URL the allowlist rejects", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchPictureData("https://example.com/Foo.png")).toBeNull();
    expect(await fetchPictureData("http://upload.wikimedia.org/x/Foo.png")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes a deadline to fetch and gives up on a timeout, an error, or a bad status", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchPictureData("https://upload.wikimedia.org/x/Foo.png", { timeoutMs: 50 })).toBeNull();
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(png, {}, 404)));
    expect(await fetchPictureData("https://upload.wikimedia.org/x/Foo.png")).toBeNull();
  });

  it("drops a response that is too large, declared or actual, or not an image", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(png, { "content-length": "99999999" })));
    expect(await fetchPictureData("https://upload.wikimedia.org/x/Foo.png")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(new Uint8Array(64) as Uint8Array<ArrayBuffer>)));
    expect(await fetchPictureData("https://upload.wikimedia.org/x/Foo.png", { maxBytes: 16 })).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { headers: { "content-type": "text/html" } })));
    expect(await fetchPictureData("https://upload.wikimedia.org/x/Foo.png")).toBeNull();
  });

  it("trusts the extension when the server sends a generic content type", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Blob([png]), { headers: { "content-type": "application/octet-stream" } })));
    const data = await fetchPictureData("https://upload.wikimedia.org/x/Foo.jpg");
    expect(data).toMatch(/^data:image\/jpeg;base64,/);
  });
});
