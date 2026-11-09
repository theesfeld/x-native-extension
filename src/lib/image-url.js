import { assertMediaUrl, IMAGE_HOSTS } from "./hosts.js";

const FORMATS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

/**
 * Build the public original-size variant of a pbs.twimg.com/media URL that is
 * already in the page. Returns null when the address is not a post photo.
 * Does not invent ids or hosts. allowLocal is only for fixture pages, and
 * only when this installed copy's manifest already grants 127.0.0.1.
 * @param {string} src
 * @param {{ allowLocal?: boolean }} [options]
 * @returns {string | null}
 */
export function toOriginalImageUrl(src, options = {}) {
  const parsed = parseMediaUrl(src, options);
  if (!parsed) return null;
  const out = new URL(`${parsed.origin}/media/${parsed.id}`);
  out.searchParams.set("format", parsed.format === "jpeg" ? "jpg" : parsed.format);
  out.searchParams.set("name", "orig");
  return out.toString();
}

/**
 * Candidate URLs, best first: original, then large, then the in-page URL.
 * @param {string} src
 * @param {{ allowLocal?: boolean }} [options]
 * @returns {string[]}
 */
export function imageCandidateUrls(src, options = {}) {
  const original = toOriginalImageUrl(src, options);
  if (!original) return [];
  const urls = [original];
  const large = withName(original, "large");
  if (large && !urls.includes(large)) urls.push(large);
  const hosts = options.allowLocal ? [...IMAGE_HOSTS, "127.0.0.1", "localhost"] : IMAGE_HOSTS;
  try {
    const raw = assertMediaUrl(src, hosts);
    if (raw.pathname.includes("/media/") && !urls.includes(raw.toString())) urls.push(raw.toString());
  } catch {
    /* the original candidate is enough */
  }
  return urls;
}

/**
 * @param {string} src
 * @param {string} name
 */
export function withName(src, name) {
  const url = new URL(src);
  url.searchParams.set("name", name);
  return url.toString();
}

/**
 * @param {string} src
 * @param {{ allowLocal?: boolean }} [options]
 * @returns {{ id: string, format: string, origin: string } | null}
 */
function parseMediaUrl(src, options = {}) {
  let url;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  const local = options.allowLocal && url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  const remote = url.protocol === "https:" && url.hostname === "pbs.twimg.com";
  if (!local && !remote) return null;
  if (url.username || url.password) return null;
  const match = url.pathname.match(
    /^\/media\/([A-Za-z0-9_-]+?)(?:\.(jpg|jpeg|png|webp|gif))?(?::[A-Za-z0-9]+)?$/i,
  );
  if (!match) return null;
  let format = (url.searchParams.get("format") || match[2] || "jpg").toLowerCase();
  if (format === "jpeg") format = "jpg";
  if (!FORMATS.has(format)) return null;
  return { id: match[1], format, origin: url.origin };
}
