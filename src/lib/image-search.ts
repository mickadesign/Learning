// Pictures for cards come from Wikipedia and Wikimedia Commons: free to
// reuse, credited, and reachable from a browser without a key (both APIs
// answer cross-origin requests). Two lookups:
//
// - wikipediaLeadImage(title): the lead image of an exact article — the
//   reliable path when you can name the thing ("Las Meninas").
// - commonsSearch(query): a file search on Commons for everything else.
//
// findImages() combines them. Works in the browser (the WebMCP tool) and
// in Node (the generator, the CLI); Node requests carry a User-Agent as
// Wikimedia asks.

import type { ImageCredit, PictureHint } from "./deck";

export interface ImageCandidate {
  /** A resized copy (about `width` px wide) to put on the card. */
  url: string;
  width?: number;
  height?: number;
  /** The work or subject. */
  title: string;
  /** The page to link for humans. */
  source: string;
  author?: string;
  /** "Public domain", "CC BY-SA 4.0", … Missing when Commons has none. */
  license?: string;
  description?: string;
  origin: "wikipedia" | "commons";
}

export interface LookupOptions {
  /** Target width of the returned copy. @default 800 */
  width?: number;
  /** Wikipedia language edition. @default "en" */
  lang?: string;
  signal?: AbortSignal;
}

const USER_AGENT = "Flashcards/1.0 (https://github.com/mickadesign/Learning)";

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  const headers: Record<string, string> = { accept: "application/json" };
  // Browsers set their own User-Agent (and forbid overriding it); Node is
  // asked to identify itself.
  if (typeof window === "undefined") headers["user-agent"] = USER_AGENT;
  const res = await fetch(url, { headers, signal });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

/** Commons descriptions and author fields are HTML fragments. */
function plain(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const text = html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

/** Licenses Commons carries but the site shouldn't reuse. */
function reusable(license: string | undefined): boolean {
  return !license || !/fair use|non-free|copyrighted/i.test(license);
}

/** "File:Foo bar.jpg" → "Foo bar" */
function fileTitle(name: string): string {
  return name.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " ");
}

/** Commons' ObjectName is often a Wikidata QuickStatements blob
 *  ("title QS:P1476,en:…"); only a short, plain one is worth showing. */
function objectName(html: string | undefined): string | undefined {
  const name = plain(html);
  return name && !/QS:/.test(name) && name.length <= 120 ? name : undefined;
}

/** Attribution can run to a paragraph; a caption needs one line. */
function short(text: string | undefined, max = 120): string | undefined {
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Thumbnail URLs carry tracking parameters; the card doesn't need them. */
function bare(url: string): string {
  return url.replace(/\?.*$/, "");
}

interface ImageInfo {
  thumburl?: string;
  thumbwidth?: number;
  thumbheight?: number;
  url?: string;
  width?: number;
  height?: number;
  mime?: string;
  descriptionurl?: string;
  extmetadata?: Record<string, { value?: string }>;
}

interface QueryPage {
  title: string;
  index?: number;
  missing?: boolean | string;
  imageinfo?: ImageInfo[];
}

function candidateFrom(page: QueryPage, origin: ImageCandidate["origin"], fallback?: Partial<ImageCandidate>): ImageCandidate | null {
  const info = page.imageinfo?.[0];
  if (!info?.thumburl && !info?.url) return null;
  if (info.mime && !/^image\/(jpeg|png|webp|gif|svg\+xml)$/.test(info.mime)) return null;
  const meta = info.extmetadata ?? {};
  const license = plain(meta.LicenseShortName?.value);
  if (!reusable(license)) return null;
  return {
    url: bare(info.thumburl ?? info.url!),
    width: info.thumbwidth ?? info.width,
    height: info.thumbheight ?? info.height,
    title: fallback?.title ?? objectName(meta.ObjectName?.value) ?? fileTitle(page.title),
    source: fallback?.source ?? info.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
    author: short(plain(meta.Artist?.value) ?? plain(meta.Credit?.value)),
    license,
    description: fallback?.description ?? short(plain(meta.ImageDescription?.value), 200),
    origin,
  };
}

/** License and author for one file, from Commons or (for local uploads)
 *  the wiki the page lives on. */
async function imageInfo(
  fileName: string,
  hosts: string[],
  { width = 800, signal }: LookupOptions
): Promise<QueryPage | null> {
  for (const host of hosts) {
    const url =
      `https://${host}/w/api.php?action=query&format=json&origin=*` +
      `&titles=${encodeURIComponent(`File:${fileName}`)}` +
      `&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=${width}`;
    const data = await getJson<{ query?: { pages?: Record<string, QueryPage> } }>(url, signal);
    const page = Object.values(data?.query?.pages ?? {})[0];
    if (page && !page.missing && page.imageinfo?.length) return page;
  }
  return null;
}

interface Summary {
  type?: string;
  title?: string;
  description?: string;
  thumbnail?: { source: string; width: number; height: number };
  originalimage?: { source: string; width: number; height: number };
  content_urls?: { desktop?: { page?: string } };
}

/** The lead image of an exact Wikipedia article, with its credit. Null
 *  when the article doesn't exist, is a disambiguation page, has no
 *  image, or the image isn't free to reuse. */
export async function wikipediaLeadImage(
  title: string,
  options: LookupOptions = {}
): Promise<ImageCandidate | null> {
  const { lang = "en", width = 800, signal } = options;
  const slug = encodeURIComponent(title.trim().replace(/ /g, "_"));
  const summary = await getJson<Summary>(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${slug}`,
    signal
  );
  if (!summary || summary.type === "disambiguation") return null;
  const thumb = summary.thumbnail?.source ?? summary.originalimage?.source;
  if (!thumb) return null;
  // ".../thumb/3/31/Foo.jpg/320px-Foo.jpg" → the file name and a wider copy.
  const match = thumb.match(/\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/([^/]+)\/\d+px-/);
  const fileName = match ? decodeURIComponent(match[1]) : undefined;
  const page = fileName
    ? await imageInfo(fileName, ["commons.wikimedia.org", `${lang}.wikipedia.org`], { width, signal })
    : null;
  const fallback = {
    title: summary.title ?? title,
    source: summary.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${slug}`,
    description: summary.description,
  };
  if (page) return candidateFrom(page, "wikipedia", fallback);
  // No metadata reachable: still usable, uncredited, at the summary's size.
  const original = summary.originalimage;
  return {
    url:
      original && original.width <= width
        ? original.source
        : thumb.replace(/\/\d+px-/, `/${width}px-`),
    title: fallback.title,
    source: fallback.source,
    description: fallback.description,
    origin: "wikipedia",
  };
}

/** Files on Wikimedia Commons matching a query, most relevant first. */
export async function commonsSearch(
  query: string,
  { limit = 5, width = 800, signal }: LookupOptions & { limit?: number } = {}
): Promise<ImageCandidate[]> {
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*` +
    `&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=${Math.min(limit * 2, 20)}` +
    `&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=${width}`;
  const data = await getJson<{ query?: { pages?: Record<string, QueryPage> } }>(url, signal);
  const pages = Object.values(data?.query?.pages ?? {}).sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0)
  );
  const out: ImageCandidate[] = [];
  for (const page of pages) {
    const c = candidateFrom(page, "commons");
    if (c) out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

export interface FindOptions extends LookupOptions {
  /** An exact Wikipedia article title to try first. */
  title?: string;
  /** How many candidates at most. @default 5 */
  limit?: number;
}

/** Best-first candidates for a card: the article's lead image when a title
 *  is known (or the query itself names an article), then Commons search. */
export async function findImages(
  query: string,
  { title, limit = 5, ...options }: FindOptions = {}
): Promise<ImageCandidate[]> {
  const out: ImageCandidate[] = [];
  const seen = new Set<string>();
  const push = (c: ImageCandidate | null) => {
    if (c && !seen.has(c.url)) {
      seen.add(c.url);
      out.push(c);
    }
  };
  const lead = await wikipediaLeadImage(title ?? query, options).catch(() => null);
  push(lead);
  if (out.length < limit) {
    const found = await commonsSearch(query, { ...options, limit }).catch(() => []);
    for (const c of found) push(c);
  }
  return out.slice(0, limit);
}

/** The credit to store on a card for a candidate. */
export function creditFor(c: ImageCandidate): ImageCredit {
  const credit: ImageCredit = { title: c.title, source: c.source };
  if (c.author) credit.author = c.author;
  if (c.license) credit.license = c.license;
  return credit;
}

/** Resolve a card's `picture` hint to a real, credited image on the card:
 *  the named article's lead image goes in the hinted slot (always the
 *  reveal slot on a true/false card, whose picture would give the answer
 *  away), with the alt text and the credit. `found` is null when the
 *  article has no reusable lead image; the card comes back untouched then,
 *  minus the hint. */
export async function attachPicture<T extends { kind: string }>(
  card: T & { picture?: PictureHint },
  options: LookupOptions = {}
): Promise<{ card: T; found: ImageCandidate | null }> {
  const { picture, ...rest } = card;
  const bare = rest as unknown as T;
  if (!picture || card.kind === "order") return { card: bare, found: null };
  const found = await wikipediaLeadImage(picture.wikipediaTitle, options).catch(() => null);
  if (!found) return { card: bare, found: null };
  const slot = card.kind === "truefalse" ? "revealImage" : picture.slot;
  return {
    card: {
      ...bare,
      [slot]: found.url,
      imageAlt: picture.alt,
      imageCredit: creditFor(found),
    },
    found,
  };
}
