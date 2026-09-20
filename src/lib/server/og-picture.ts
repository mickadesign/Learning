// Pictures for the share card of a shared deck. The deck comes from a
// stranger, so its image URLs are not to be fetched blindly: only the
// Wikimedia hosts the site itself pulls pictures from, only png/jpeg (all
// satori can draw), fetched with a deadline and a size cap, and embedded as
// data URIs so the renderer never touches the network itself. A picture
// that fails any of this is simply left off the card.

const ALLOWED_HOSTS = new Set(["upload.wikimedia.org", "thumb.wikimedia.org", "commons.wikimedia.org"]);
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };

export const PICTURE_TIMEOUT_MS = 4000;
export const PICTURE_MAX_BYTES = 5_000_000;

/** An https png/jpeg on an allowed host, or nothing. */
export function renderablePicture(src: string | undefined): string | null {
  if (!src) return null;
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) return null;
  if (!/\.(png|jpe?g)$/i.test(url.pathname)) return null;
  return url.toString();
}

/** The picture as a data URI, or null when it is slow, large, or not an
 *  image after all. */
export async function fetchPictureData(
  src: string,
  { timeoutMs = PICTURE_TIMEOUT_MS, maxBytes = PICTURE_MAX_BYTES } = {}
): Promise<string | null> {
  const url = renderablePicture(src);
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
    if (!res.ok) return null;
    const type = res.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    const ext = url.split(".").pop()!.toLowerCase();
    // The server's word when it gives one; the extension only when it is
    // silent or generic. Anything else (an HTML error page) is not a picture.
    const generic = !type || type === "application/octet-stream" || type === "binary/octet-stream";
    const mime = generic ? MIME[ext] : type === "image/png" || type === "image/jpeg" ? type : undefined;
    if (!mime) return null;
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > maxBytes) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > maxBytes) return null;
    return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  }
}
