import { assertMediaUrl, VIDEO_HOSTS } from "./hosts.js";

const FILE_RE = /\.(mp4|webm|mov|m4s)(?:$|\?)/i;
const PLAYLIST_RE = /\.m3u8(?:$|\?)/i;

/**
 * Snowflake-sized ids. Short numbers (dimensions, years) are ignored.
 * @param {string} value
 * @returns {Set<string>}
 */
export function mediaIds(value) {
  const ids = new Set();
  for (const match of String(value || "").matchAll(/(?<!\d)(\d{12,22})(?!\d)/g)) ids.add(match[1]);
  return ids;
}

/**
 * @param {string} url
 * @returns {number}
 */
export function resolutionScore(url) {
  try {
    const path = new URL(url).pathname;
    const match = path.match(/(\d{2,5})x(\d{2,5})/);
    if (match) return Number(match[1]) * Number(match[2]);
  } catch {
    return 0;
  }
  return 0;
}

/**
 * @param {string} url
 * @returns {"file" | "playlist" | null}
 */
export function classifyVideoUrl(url) {
  let parsed;
  try {
    parsed = assertMediaUrl(url, VIDEO_HOSTS);
  } catch {
    return null;
  }
  if (PLAYLIST_RE.test(parsed.pathname)) return "playlist";
  if (FILE_RE.test(parsed.pathname) || parsed.pathname.includes("/vid/")) return "file";
  return null;
}

/**
 * Choose video URLs that actually appeared on the element or in observed
 * page requests. Never synthesizes a video.twimg.com path from an id.
 *
 * @param {{
 *   hints?: string[],
 *   directUrls?: string[],
 *   observedUrls?: string[],
 *   playbackUrls?: string[],
 *   playbackExclusive?: boolean,
 * }} input
 * @returns {string[]}
 */
export function collectVideoUrls(input) {
  const hintIds = new Set();
  for (const hint of input.hints || []) {
    for (const id of mediaIds(hint)) hintIds.add(id);
  }
  const out = [];
  const add = (url) => {
    if (!url || out.includes(url)) return;
    if (!classifyVideoUrl(url)) return;
    out.push(url);
  };
  const sharesHint = (url) => {
    if (hintIds.size === 0) return false;
    for (const id of mediaIds(url)) {
      if (hintIds.has(id)) return true;
    }
    return false;
  };

  for (const url of input.directUrls || []) add(url);
  for (const url of input.playbackUrls || []) {
    if (input.playbackExclusive || sharesHint(url) || hintIds.size === 0) add(url);
  }
  for (const url of input.observedUrls || []) {
    if (sharesHint(url)) add(url);
  }
  return out;
}
