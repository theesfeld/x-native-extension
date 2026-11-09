import { UserVisibleError } from "./errors.js";
import { assertMediaUrl, IMAGE_HOSTS, VIDEO_HOSTS } from "./hosts.js";
import { parsePlaylist, pickVariant, resolvePlaylistUrl } from "./playlist.js";
import { sniffBytes } from "./sniff.js";
import { resolutionScore } from "./video-url.js";

const MAX_IMAGE_BYTES = 40_000_000;
const MAX_VIDEO_BYTES = 400_000_000;
const MAX_SEGMENTS = 500;
const MAX_PLAYLIST_PEEKS = 4;

/**
 * @param {string[]} urls
 * @param {{ fetchImpl?: typeof fetch }} [deps]
 */
export async function resolveImage(urls, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const hosts = deps.hosts || IMAGE_HOSTS;
  /** @type {string[]} */
  const errors = [];
  for (const url of urls) {
    try {
      const got = await fetchMedia(url, hosts, fetchImpl, MAX_IMAGE_BYTES);
      const sniff = sniffBytes(got.bytes);
      if (sniff.kind !== "image" || !sniff.ext) {
        errors.push("response was not an image");
        continue;
      }
      const usedOriginal = /(?:\?|&)name=orig(?:&|$)/.test(got.url);
      return {
        bytes: got.bytes,
        ext: sniff.ext,
        mime: sniff.mime,
        notice: usedOriginal
          ? "Saved the original image."
          : "The original size was not available. Saved the largest image file that was actually a picture.",
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "image request failed");
    }
  }
  const reason = errors.find(Boolean) || "the image request failed";
  throw new UserVisibleError(
    errors.some((item) => /not an image|web page|host/i.test(item))
      ? "The image address did not return a picture. Nothing was saved."
      : `Could not download the image. ${reason} Nothing was saved.`,
    "image-failed",
  );
}

/**
 * @param {string[]} urls
 * @param {{ fetchImpl?: typeof fetch }} [deps]
 */
export async function resolveVideo(urls, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const unique = [...new Set(urls)].slice(0, 8);
  /** @type {string[]} */
  const notes = [];
  /** @type {{ url: string, score: number, kind: "file" | "playlist" }[]} */
  const options = [];

  for (const url of unique) {
    let parsed;
    try {
      parsed = assertMediaUrl(url, VIDEO_HOSTS);
    } catch (error) {
      notes.push(error instanceof Error ? error.message : "bad url");
      continue;
    }
    if (/\.m3u8(?:$|\?)/i.test(parsed.pathname)) options.push({ url, score: 0, kind: "playlist" });
    else options.push({ url, score: resolutionScore(url), kind: "file" });
  }

  const playlists = options.filter((item) => item.kind === "playlist").slice(0, MAX_PLAYLIST_PEEKS);
  for (const item of playlists) {
    try {
      const peeked = await peekPlaylistScore(item.url, fetchImpl);
      item.score = peeked.score;
      if (peeked.note) notes.push(peeked.note);
    } catch (error) {
      item.score = -1;
      notes.push(error instanceof Error ? error.message : "playlist failed");
    }
  }

  options.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.kind !== b.kind) return a.kind === "file" ? -1 : 1;
    return 0;
  });

  if (options.length && options.every((item) => item.score < 0) && notes.some((item) => /encrypt/i.test(item))) {
    throw new UserVisibleError(
      "This video uses an encrypted playlist. The extension does not bypass encryption. Nothing was saved.",
      "encrypted",
    );
  }

  /** @type {string[]} */
  const failures = [];
  for (const option of options) {
    if (option.score < 0) continue;
    try {
      return await downloadChosen(option.url, fetchImpl, 0);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "video failed");
      if (error instanceof UserVisibleError && error.code === "encrypted") {
        /* try a lower unencrypted candidate before giving up */
      }
    }
  }

  if (failures.some((item) => /encrypt/i.test(item)) && options.length === 1) {
    throw new UserVisibleError(
      "This video uses an encrypted playlist. The extension does not bypass encryption. Nothing was saved.",
      "encrypted",
    );
  }
  if (failures.some((item) => /web page|not a video|not a media/i.test(item))) {
    throw new UserVisibleError(
      "The address returned a web page or an unrecognized file instead of a video. Nothing was saved.",
      "not-video",
    );
  }
  const detail = failures[0] || "The full video file was not available from the addresses the page had loaded.";
  throw new UserVisibleError(
    /nothing was saved/i.test(detail) ? detail : `${detail} Nothing was saved.`,
    "video-failed",
  );
}

/**
 * @param {string} url
 * @param {typeof fetch} fetchImpl
 */
async function peekPlaylistScore(url, fetchImpl) {
  const got = await fetchMedia(url, VIDEO_HOSTS, fetchImpl, 2_000_000);
  const sniff = sniffBytes(got.bytes);
  if (sniff.kind === "video") return { score: Math.max(resolutionScore(url), 1), note: "" };
  if (sniff.kind !== "playlist") return { score: -1, note: "playlist response was not a playlist" };
  const parsed = parsePlaylist(decodeText(got.bytes));
  if (parsed.encrypted) return { score: -1, note: "encrypted playlist" };
  if (parsed.kind === "master") {
    const variant = pickVariant(parsed.variants);
    if (!variant) return { score: -1, note: "playlist had no variants" };
    const score = variant.width * variant.height || variant.bandwidth || 1;
    return { score, note: "" };
  }
  return { score: 1, note: "" };
}

/**
 * @param {string} url
 * @param {typeof fetch} fetchImpl
 * @param {number} depth
 */
async function downloadChosen(url, fetchImpl, depth) {
  if (depth > 2) throw new UserVisibleError("The video playlist was nested too deeply. Nothing was saved.", "playlist");
  const got = await fetchMedia(url, VIDEO_HOSTS, fetchImpl, MAX_VIDEO_BYTES);
  const sniff = sniffBytes(got.bytes);
  if (sniff.kind === "video" && sniff.ext) return describeVideo(got.bytes, sniff.ext, sniff.mime, []);
  if (sniff.kind !== "playlist") {
    throw new UserVisibleError(
      "The address returned a web page or an unrecognized file instead of a video. Nothing was saved.",
      "not-video",
    );
  }
  const parsed = parsePlaylist(decodeText(got.bytes));
  if (parsed.encrypted) {
    throw new UserVisibleError(
      "This video uses an encrypted playlist. The extension does not bypass encryption. Nothing was saved.",
      "encrypted",
    );
  }
  if (parsed.kind === "master") {
    const variant = pickVariant(parsed.variants);
    if (!variant) throw new UserVisibleError("The video playlist had no playable variants. Nothing was saved.", "playlist");
    const next = resolvePlaylistUrl(got.url, variant.uri);
    const saved = await downloadChosen(next, fetchImpl, depth + 1);
    if (parsed.hasSeparateAudio || variant.audioGroup) {
      saved.notice +=
        " The playlist lists audio separately, and this extension does not mux tracks, so the file may be silent.";
    }
    return saved;
  }
  if (!parsed.segments.length) {
    throw new UserVisibleError("The video playlist did not list any segments. Nothing was saved.", "playlist");
  }
  if (parsed.segments.length > MAX_SEGMENTS) {
    throw new UserVisibleError("The video playlist has more segments than this extension will download. Nothing was saved.", "playlist");
  }
  /** @type {Uint8Array[]} */
  const parts = [];
  if (parsed.map) {
    parts.push(await fetchSegment(resolvePlaylistUrl(got.url, parsed.map.uri), parsed.map.byterange, fetchImpl));
  }
  /** @type {Map<string, number>} */
  const cursors = new Map();
  for (const segment of parsed.segments) {
    const absolute = resolvePlaylistUrl(got.url, segment.uri);
    let range = segment.byterange;
    if (range && range.offset == null) {
      const offset = cursors.get(absolute) || 0;
      range = { length: range.length, offset };
      cursors.set(absolute, offset + range.length);
    } else if (range && range.offset != null) {
      cursors.set(absolute, range.offset + range.length);
    }
    parts.push(await fetchSegment(absolute, range, fetchImpl));
  }
  const bytes = concatBytes(parts);
  if (bytes.byteLength > MAX_VIDEO_BYTES) {
    throw new UserVisibleError("The video is larger than this extension will download. Nothing was saved.", "too-large");
  }
  const combined = sniffBytes(bytes);
  if (combined.kind !== "video" || !combined.ext) {
    throw new UserVisibleError(
      "The video segments were not a recognized video file. Nothing was saved.",
      "not-video",
    );
  }
  const warnings = [];
  if (parsed.hasSeparateAudio) {
    warnings.push(
      "The playlist lists audio separately, and this extension does not mux tracks, so the file may be silent.",
    );
  }
  return describeVideo(bytes, combined.ext, combined.mime, warnings);
}

/**
 * @param {Uint8Array} bytes
 * @param {string} ext
 * @param {string} mime
 * @param {string[]} warnings
 */
function describeVideo(bytes, ext, mime, warnings) {
  let notice =
    ext === "ts"
      ? "Saved the video as MPEG-TS (.ts), not MP4, because that is the stream format the page loaded. VLC and similar players can open it."
      : ext === "webm"
        ? "Saved the video as WebM."
        : "Saved the video.";
  if (warnings.length) notice = `${notice} ${warnings.join(" ")}`;
  return { bytes, ext, mime, notice };
}

/**
 * @param {string} url
 * @param {{ length: number, offset: number } | null} range
 * @param {typeof fetch} fetchImpl
 */
async function fetchSegment(url, range, fetchImpl) {
  if (!range) {
    const got = await fetchMedia(url, VIDEO_HOSTS, fetchImpl, MAX_VIDEO_BYTES);
    rejectIfMarkup(got.bytes);
    return got.bytes;
  }
  const got = await fetchMedia(url, VIDEO_HOSTS, fetchImpl, MAX_VIDEO_BYTES, {
    Range: `bytes=${range.offset}-${range.offset + range.length - 1}`,
  });
  rejectIfMarkup(got.bytes);
  if (got.status === 206 || got.bytes.byteLength === range.length) return got.bytes;
  if (got.bytes.byteLength >= range.offset + range.length) {
    return got.bytes.subarray(range.offset, range.offset + range.length);
  }
  return got.bytes;
}

/** @param {Uint8Array} bytes */
function rejectIfMarkup(bytes) {
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 64)).trim().toLowerCase();
  if (
    head.startsWith("<!doctype") ||
    head.startsWith("<html") ||
    head.startsWith("<head") ||
    head.startsWith("{") ||
    head.startsWith("<?xml")
  ) {
    throw new UserVisibleError(
      "A video segment was a web page instead of media. Nothing was saved.",
      "not-video",
    );
  }
}

/**
 * @param {string} url
 * @param {string[]} hosts
 * @param {typeof fetch} fetchImpl
 * @param {number} maxBytes
 * @param {Record<string, string>} [headers]
 */
async function fetchMedia(url, hosts, fetchImpl, maxBytes, headers) {
  const checked = assertMediaUrl(url, hosts);
  const response = await fetchImpl(checked.toString(), {
    credentials: "include",
    redirect: "follow",
    headers,
    signal: AbortSignal.timeout(45_000),
  });
  const finalUrl = assertMediaUrl(response.url || checked.toString(), hosts).toString();
  if (!response.ok && response.status !== 206) {
    throw new UserVisibleError(`The media request failed (${response.status}).`, "http");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    throw new UserVisibleError("The file is larger than this extension will download. Nothing was saved.", "too-large");
  }
  return { bytes, url: finalUrl, status: response.status };
}

const OPEN_FILE = /\.(mp4|webm)(?:$|\?)/i;

/**
 * A URL a new tab can show: a progressive MP4/WebM the page already loaded,
 * or one named by a playlist the page requested. Segmented streams and blob
 * URLs are refused. Nothing is invented.
 * @param {string[]} urls
 * @param {{ fetchImpl?: typeof fetch, hosts?: string[] }} [deps]
 */
export async function resolveOpenableVideoUrl(urls, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const hosts = deps.hosts || VIDEO_HOSTS;
  return openableVideoUrl(urls, deps, hosts, fetchImpl, 0);
}

/**
 * @param {string[]} urls
 * @param {{ fetchImpl?: typeof fetch, hosts?: string[] }} deps
 * @param {string[]} hosts
 * @param {typeof fetch} fetchImpl
 * @param {number} depth
 */
async function openableVideoUrl(urls, deps, hosts, fetchImpl, depth) {
  if (depth > 2) {
    throw new UserVisibleError("The video playlist was nested too deeply. Nothing was opened.", "playlist");
  }
  const files = [];
  const playlists = [];
  for (const url of [...new Set(urls)].slice(0, 8)) {
    let parsed;
    try {
      parsed = assertMediaUrl(url, hosts);
    } catch {
      continue;
    }
    if (/\.m3u8(?:$|\?)/i.test(parsed.pathname)) playlists.push(parsed.toString());
    else if (OPEN_FILE.test(parsed.pathname)) files.push(parsed.toString());
  }
  files.sort((a, b) => resolutionScore(b) - resolutionScore(a));
  if (files[0]) return files[0];
  for (const playlistUrl of playlists.slice(0, 4)) {
    const got = await fetchMedia(playlistUrl, hosts, fetchImpl, 2_000_000);
    const sniff = sniffBytes(got.bytes);
    if (sniff.kind === "video" && OPEN_FILE.test(new URL(got.url).pathname)) return got.url;
    if (sniff.kind !== "playlist") continue;
    const parsed = parsePlaylist(decodeText(got.bytes));
    if (parsed.encrypted) {
      throw new UserVisibleError("This video uses an encrypted playlist. Nothing was opened.", "encrypted");
    }
    if (parsed.kind === "master") {
      const variant = pickVariant(parsed.variants);
      if (!variant) continue;
      const next = resolvePlaylistUrl(got.url, variant.uri);
      if (OPEN_FILE.test(new URL(next).pathname)) return assertMediaUrl(next, hosts).toString();
      return openableVideoUrl([next], deps, hosts, fetchImpl, depth + 1);
    }
    if (parsed.segments.length === 1) {
      const only = resolvePlaylistUrl(got.url, parsed.segments[0].uri);
      if (OPEN_FILE.test(new URL(only).pathname)) return assertMediaUrl(only, hosts).toString();
    }
    throw new UserVisibleError(
      "This video is a segmented stream, not one file a new tab can play. Nothing was opened.",
      "segmented",
    );
  }
  throw new UserVisibleError("No full video address was loaded by the page. Nothing was opened.", "no-video-url");
}

/** @param {Uint8Array[]} chunks */
export function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** @param {Uint8Array} bytes */
function decodeText(bytes) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}
