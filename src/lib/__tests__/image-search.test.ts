import { beforeEach, describe, expect, it, vi } from "vitest";
import { attachPicture, creditFor, findImages, wikipediaLeadImage, type ImageCandidate } from "@/lib/image-search";
import { choice, order, trueFalse } from "./fixtures";

// Wikipedia and Commons, faked: the summary endpoint names the lead image,
// the imageinfo endpoint credits it. Titles are unique per test so the
// module's lookup cache never crosses tests.

let seq = 0;
const uniqueTitle = (base: string) => `${base} ${++seq}`;

function summaryFor(title: string, file = "Foo_bar.jpg") {
  return {
    type: "standard",
    title,
    description: "a painting",
    thumbnail: { source: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${file}/320px-${file}`, width: 320, height: 200 },
    originalimage: { source: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${file}`, width: 2000, height: 1200 },
    content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${title.replace(/ /g, "_")}` } },
  };
}

function imageInfoFor(file: string, license = "Public domain") {
  return {
    query: {
      pages: {
        "1": {
          title: `File:${file}`,
          imageinfo: [
            {
              thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${file}/800px-${file}?x=1`,
              thumbwidth: 800,
              thumbheight: 500,
              mime: "image/jpeg",
              descriptionurl: `https://commons.wikimedia.org/wiki/File:${file}`,
              extmetadata: {
                LicenseShortName: { value: license },
                Artist: { value: "<a href='#'>Some Painter</a>" },
                ObjectName: { value: "The Work" },
              },
            },
          ],
        },
      },
    },
  };
}

type Route = (url: string) => unknown | null;

function fakeFetch(route: Route) {
  const mock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = route(url);
    if (body === null) return new Response("", { status: 404 });
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("wikipediaLeadImage", () => {
  it("finds the lead image and credits it from Commons", async () => {
    const title = uniqueTitle("Las Meninas");
    fakeFetch((url) => (url.includes("/page/summary/") ? summaryFor(title) : url.includes("commons.wikimedia.org") ? imageInfoFor("Foo_bar.jpg") : null));
    const found = await wikipediaLeadImage(title);
    expect(found).toMatchObject({
      origin: "wikipedia",
      title,
      author: "Some Painter",
      license: "Public domain",
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Foo_bar.jpg/800px-Foo_bar.jpg",
    });
    expect(found?.source).toMatch(/en\.wikipedia\.org\/wiki\//);
  });

  it("is null for a missing article, a disambiguation page, or an article without a picture", async () => {
    const missing = uniqueTitle("Nothing");
    fakeFetch(() => null);
    expect(await wikipediaLeadImage(missing)).toBeNull();
    const dab = uniqueTitle("Mercury");
    fakeFetch(() => ({ type: "disambiguation", title: dab }));
    expect(await wikipediaLeadImage(dab)).toBeNull();
    const bare = uniqueTitle("Plain");
    fakeFetch(() => ({ type: "standard", title: bare }));
    expect(await wikipediaLeadImage(bare)).toBeNull();
  });

  it("drops non-free files but keeps the uncredited copy when metadata is unreachable", async () => {
    const nonFree = uniqueTitle("Poster");
    fakeFetch((url) => (url.includes("/page/summary/") ? summaryFor(nonFree) : imageInfoFor("Foo_bar.jpg", "Fair use")));
    expect(await wikipediaLeadImage(nonFree)).toBeNull();
    const noMeta = uniqueTitle("Quiet");
    fakeFetch((url) => (url.includes("/page/summary/") ? summaryFor(noMeta) : null));
    const found = await wikipediaLeadImage(noMeta);
    expect(found?.url).toBe("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Foo_bar.jpg/800px-Foo_bar.jpg");
    expect(found?.author).toBeUndefined();
  });

  it("looks an article up once per page load, case and spacing aside", async () => {
    const title = uniqueTitle("Girl with a Pearl Earring");
    const mock = fakeFetch((url) => (url.includes("/page/summary/") ? summaryFor(title) : imageInfoFor("Foo_bar.jpg")));
    await Promise.all([wikipediaLeadImage(title), wikipediaLeadImage(title.toUpperCase()), wikipediaLeadImage(`  ${title} `)]);
    expect(mock.mock.calls.filter(([u]) => String(u).includes("/page/summary/"))).toHaveLength(1);
  });

  it("does not cache a lookup that threw", async () => {
    const title = uniqueTitle("Flaky");
    const mock = vi.fn().mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", mock);
    await expect(wikipediaLeadImage(title)).rejects.toThrow("offline");
    fakeFetch((url) => (url.includes("/page/summary/") ? summaryFor(title) : imageInfoFor("Foo_bar.jpg")));
    expect(await wikipediaLeadImage(title)).not.toBeNull();
  });
});

describe("findImages", () => {
  it("puts the article's lead image first and fills up from Commons search without repeats", async () => {
    const title = uniqueTitle("Bauhaus");
    fakeFetch((url) => {
      if (url.includes("/page/summary/")) return summaryFor(title, "Lead.jpg");
      if (url.includes("generator=search")) {
        const page = (file: string, i: number) => ({ ...imageInfoFor(file).query.pages["1"], index: i });
        return { query: { pages: { a: page("Lead.jpg", 1), b: page("Other.jpg", 2), c: page("Third.jpg", 3) } } };
      }
      return imageInfoFor(url.includes("Lead") ? "Lead.jpg" : "Other.jpg");
    });
    const found = await findImages("bauhaus building", { title, limit: 3 });
    expect(found.map((c) => c.url)).toEqual([
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Lead.jpg/800px-Lead.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Other.jpg/800px-Other.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Third.jpg/800px-Third.jpg",
    ]);
    expect(found[0].origin).toBe("wikipedia");
    expect(found[1].origin).toBe("commons");
  });
});

describe("creditFor", () => {
  it("copies only the fields a caption needs", () => {
    const c: ImageCandidate = { url: "u", title: "T", source: "s", author: "A", license: "CC BY 4.0", origin: "commons", description: "long" };
    expect(creditFor(c)).toEqual({ title: "T", source: "s", author: "A", license: "CC BY 4.0" });
    expect(creditFor({ url: "u", title: "T", source: "s", origin: "wikipedia" })).toEqual({ title: "T", source: "s" });
  });
});

describe("attachPicture", () => {
  it("leaves order cards and unhinted cards alone", async () => {
    const mock = fakeFetch(() => null);
    const o = order("o");
    expect(await attachPicture(o)).toEqual({ card: o, found: null });
    const c = choice("c");
    expect(await attachPicture(c)).toEqual({ card: c, found: null });
    expect(mock).not.toHaveBeenCalled();
  });

  it("puts the found image in the hinted slot with alt and credit, and strips the hint", async () => {
    const title = uniqueTitle("Mona Lisa");
    fakeFetch((url) => (url.includes("/page/summary/") ? summaryFor(title) : imageInfoFor("Foo_bar.jpg")));
    const { card, found } = await attachPicture({ ...choice("c"), picture: { wikipediaTitle: title, slot: "image", alt: "A portrait." } });
    expect(found).not.toBeNull();
    expect(card).toMatchObject({ image: found!.url, imageAlt: "A portrait.", imageCredit: { title, license: "Public domain" } });
    expect("picture" in card).toBe(false);
    expect((card as { revealImage?: string }).revealImage).toBeUndefined();
  });

  it("always uses the reveal slot on a true/false card and defaults to it without a slot", async () => {
    const title = uniqueTitle("Eiffel Tower");
    fakeFetch((url) => (url.includes("/page/summary/") ? summaryFor(title) : imageInfoFor("Foo_bar.jpg")));
    const tf = await attachPicture({ ...trueFalse("t"), picture: { wikipediaTitle: title, alt: "A tower." } });
    expect((tf.card as { revealImage?: string }).revealImage).toBe(tf.found!.url);
    const c = await attachPicture({ ...choice("c"), picture: { wikipediaTitle: title, alt: "A tower." } });
    expect((c.card as { revealImage?: string }).revealImage).toBe(c.found!.url);
    expect((c.card as { image?: string }).image).toBeUndefined();
  });

  it("returns the bare card when the article has no free image", async () => {
    const title = uniqueTitle("Nowhere");
    fakeFetch(() => null);
    const { card, found } = await attachPicture({ ...choice("c"), picture: { wikipediaTitle: title, slot: "image", alt: "x" } });
    expect(found).toBeNull();
    expect(card).toEqual(choice("c"));
  });
});
