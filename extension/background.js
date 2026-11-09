/* Generated from src by scripts/build.mjs. Edit the source, then rebuild. */

// src/lib/errors.js
var UserVisibleError = class extends Error {
  /**
   * @param {string} message Shown in the on-page toast. No stack, no URL dump.
   * @param {string} [code]
   */
  constructor(message, code = "user") {
    super(message);
    this.name = "UserVisibleError";
    this.code = code;
  }
};

// src/lib/hosts.js
var PRODUCTION_PAGE_HOSTS = ["x.com", "twitter.com"];
var IMAGE_HOSTS = ["pbs.twimg.com"];
var VIDEO_HOSTS = ["video.twimg.com"];
function isAllowedPageUrl(value, manifest) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (url.protocol === "https:" && PRODUCTION_PAGE_HOSTS.includes(url.hostname)) return true;
  if (url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost") && manifestGrantsLocalFixtures(manifest)) {
    return true;
  }
  return false;
}
function manifestGrantsLocalFixtures(manifest) {
  const perms = manifest?.host_permissions || [];
  return perms.includes("http://127.0.0.1/*") || perms.includes("http://localhost/*");
}
function resolveComposerUrl(requested, manifest) {
  const production = "https://x.com/compose/post";
  if (!requested || !manifestGrantsLocalFixtures(manifest)) return production;
  let url;
  try {
    url = new URL(requested);
  } catch {
    return production;
  }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" && url.hostname !== "localhost") return production;
  if (url.pathname !== "/compose-fixture") return production;
  return `${url.origin}/compose-fixture`;
}
function imageHostsForManifest(manifest) {
  const hosts = [...IMAGE_HOSTS];
  if (manifestGrantsLocalFixtures(manifest)) hosts.push("127.0.0.1", "localhost");
  return hosts;
}
function assertMediaUrl(value, hosts) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new UserVisibleError("The media address was not a valid URL.", "bad-url");
  }
  const localFixture = (url.hostname === "127.0.0.1" || url.hostname === "localhost") && hosts.includes(url.hostname);
  if (url.protocol !== "https:" && !(localFixture && url.protocol === "http:")) {
    throw new UserVisibleError("Only HTTPS media addresses can be downloaded.", "bad-url");
  }
  if (url.username || url.password) {
    throw new UserVisibleError("Media addresses that contain a password are blocked.", "bad-url");
  }
  if (!hosts.includes(url.hostname)) {
    throw new UserVisibleError(
      "That file is on a host this extension does not download from.",
      "bad-host"
    );
  }
  return url;
}

// src/lib/playlist.js
function parsePlaylist(text) {
  if (typeof text !== "string") throw new Error("Playlist was not text");
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length || !lines[0].startsWith("#EXTM3U")) throw new Error("Not an HLS playlist");
  let encrypted = false;
  let hasSeparateAudio = false;
  const variants = [];
  const segments = [];
  let map = null;
  let pendingRange = null;
  let expectUriFor = null;
  let pendingVariant = null;
  for (const line of lines) {
    if (line.startsWith("#EXT-X-KEY")) {
      const method = /METHOD=([^,\s"]+)/.exec(line)?.[1] || "";
      if (method && method !== "NONE") encrypted = true;
      continue;
    }
    if (line.startsWith("#EXT-X-MEDIA")) {
      if (/TYPE=AUDIO\b/.test(line)) hasSeparateAudio = true;
      continue;
    }
    if (line.startsWith("#EXT-X-STREAM-INF")) {
      const bandwidth = Number(/BANDWIDTH=(\d+)/.exec(line)?.[1] || 0);
      const res = /RESOLUTION=(\d+)x(\d+)/.exec(line);
      pendingVariant = {
        bandwidth,
        width: res ? Number(res[1]) : 0,
        height: res ? Number(res[2]) : 0,
        audioGroup: /AUDIO="([^"]*)"/.exec(line)?.[1] || ""
      };
      expectUriFor = "variant";
      continue;
    }
    if (line.startsWith("#EXT-X-MAP")) {
      const uri = /URI="([^"]+)"/.exec(line)?.[1];
      const range = /BYTERANGE="(\d+)(?:@(\d+))?"/.exec(line);
      if (uri) {
        map = {
          uri,
          byterange: range ? { length: Number(range[1]), offset: range[2] ? Number(range[2]) : 0 } : null
        };
      }
      continue;
    }
    if (line.startsWith("#EXT-X-BYTERANGE")) {
      const match = /^#EXT-X-BYTERANGE:(\d+)(?:@(\d+))?/.exec(line);
      if (match) pendingRange = { length: Number(match[1]), offset: match[2] != null ? Number(match[2]) : null };
      continue;
    }
    if (line.startsWith("#EXTINF")) {
      expectUriFor = "segment";
      continue;
    }
    if (line.startsWith("#")) continue;
    if (expectUriFor === "variant" && pendingVariant) {
      variants.push({ ...pendingVariant, uri: line });
      pendingVariant = null;
      expectUriFor = null;
      continue;
    }
    if (expectUriFor === "segment") {
      segments.push({ uri: line, byterange: pendingRange });
      pendingRange = null;
      expectUriFor = null;
    }
  }
  return {
    kind: variants.length ? "master" : "media",
    encrypted,
    hasSeparateAudio,
    variants,
    segments,
    map
  };
}
function pickVariant(variants) {
  if (!variants.length) return null;
  return [...variants].sort((a, b) => {
    const area = b.width * b.height - a.width * a.height;
    if (area !== 0) return area;
    return b.bandwidth - a.bandwidth;
  })[0];
}
function resolvePlaylistUrl(base, relative) {
  return new URL(relative, base).toString();
}

// src/lib/sniff.js
var IMAGE_EXT = {
  jpg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp"
};
var VIDEO_EXT = {
  mp4: "video/mp4",
  webm: "video/webm",
  ts: "video/mp2t"
};
function sniffBytes(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (looksLikeMarkup(data)) return { kind: "other", ext: null, mime: "application/octet-stream" };
  if (isPng(data)) return { kind: "image", ext: "png", mime: IMAGE_EXT.png };
  if (isJpeg(data)) return { kind: "image", ext: "jpg", mime: IMAGE_EXT.jpg };
  if (isGif(data)) return { kind: "image", ext: "gif", mime: IMAGE_EXT.gif };
  if (isWebp(data)) return { kind: "image", ext: "webp", mime: IMAGE_EXT.webp };
  if (isWebm(data)) return { kind: "video", ext: "webm", mime: VIDEO_EXT.webm };
  if (isMp4(data)) return { kind: "video", ext: "mp4", mime: VIDEO_EXT.mp4 };
  if (isMpegTs(data)) return { kind: "video", ext: "ts", mime: VIDEO_EXT.ts };
  if (isPlaylist(data)) return { kind: "playlist", ext: "m3u8", mime: "application/vnd.apple.mpegurl" };
  return { kind: "other", ext: null, mime: "application/octet-stream" };
}
function looksLikeMarkup(data) {
  const head = decodeHead(data, 80).trim().toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<head") || head.startsWith("<body") || head.startsWith("<svg") || head.startsWith("{") || head.startsWith("<?xml");
}
function isPng(data) {
  return data.length >= 8 && data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71;
}
function isJpeg(data) {
  return data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255;
}
function isGif(data) {
  return data.length >= 6 && data[0] === 71 && data[1] === 73 && data[2] === 70 && data[3] === 56;
}
function isWebp(data) {
  return data.length >= 12 && data[0] === 82 && data[1] === 73 && data[2] === 70 && data[3] === 70 && data[8] === 87 && data[9] === 69 && data[10] === 66 && data[11] === 80;
}
function isWebm(data) {
  return data.length >= 4 && data[0] === 26 && data[1] === 69 && data[2] === 223 && data[3] === 163;
}
function isMp4(data) {
  const limit = Math.min(data.length - 4, 32);
  for (let i = 0; i < limit; i++) {
    if (data[i] === 102 && data[i + 1] === 116 && data[i + 2] === 121 && data[i + 3] === 112) return true;
    if (data[i] === 115 && data[i + 1] === 116 && data[i + 2] === 121 && data[i + 3] === 112) return true;
  }
  return false;
}
function isMpegTs(data) {
  if (data.length < 188 || data[0] !== 71) return false;
  const packets = Math.min(3, Math.floor(data.length / 188));
  for (let i = 0; i < packets; i++) {
    if (data[i * 188] !== 71) return false;
  }
  return packets >= 1;
}
function isPlaylist(data) {
  const head = decodeHead(data, 16).replace(/^\uFEFF/, "").trimStart();
  return head.startsWith("#EXTM3U");
}
function decodeHead(data, length) {
  const slice = data.subarray(0, Math.min(data.length, length));
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(slice);
  } catch {
    return "";
  }
}

// src/lib/video-url.js
function resolutionScore(url) {
  try {
    const path = new URL(url).pathname;
    const match = path.match(/(\d{2,5})x(\d{2,5})/);
    if (match) return Number(match[1]) * Number(match[2]);
  } catch {
    return 0;
  }
  return 0;
}

// src/lib/download-media.js
var MAX_IMAGE_BYTES = 4e7;
var MAX_VIDEO_BYTES = 4e8;
var MAX_SEGMENTS = 500;
var MAX_PLAYLIST_PEEKS = 4;
async function resolveImage(urls, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const hosts = deps.hosts || IMAGE_HOSTS;
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
        notice: usedOriginal ? "Saved the original image." : "The original size was not available. Saved the largest image file that was actually a picture."
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "image request failed");
    }
  }
  const reason = errors.find(Boolean) || "the image request failed";
  throw new UserVisibleError(
    errors.some((item) => /not an image|web page|host/i.test(item)) ? "The image address did not return a picture. Nothing was saved." : `Could not download the image. ${reason} Nothing was saved.`,
    "image-failed"
  );
}
async function resolveVideo(urls, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const unique = [...new Set(urls)].slice(0, 8);
  const notes = [];
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
      "encrypted"
    );
  }
  const failures = [];
  for (const option of options) {
    if (option.score < 0) continue;
    try {
      return await downloadChosen(option.url, fetchImpl, 0);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "video failed");
      if (error instanceof UserVisibleError && error.code === "encrypted") {
      }
    }
  }
  if (failures.some((item) => /encrypt/i.test(item)) && options.length === 1) {
    throw new UserVisibleError(
      "This video uses an encrypted playlist. The extension does not bypass encryption. Nothing was saved.",
      "encrypted"
    );
  }
  if (failures.some((item) => /web page|not a video|not a media/i.test(item))) {
    throw new UserVisibleError(
      "The address returned a web page or an unrecognized file instead of a video. Nothing was saved.",
      "not-video"
    );
  }
  const detail = failures[0] || "The full video file was not available from the addresses the page had loaded.";
  throw new UserVisibleError(
    /nothing was saved/i.test(detail) ? detail : `${detail} Nothing was saved.`,
    "video-failed"
  );
}
async function peekPlaylistScore(url, fetchImpl) {
  const got = await fetchMedia(url, VIDEO_HOSTS, fetchImpl, 2e6);
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
async function downloadChosen(url, fetchImpl, depth) {
  if (depth > 2) throw new UserVisibleError("The video playlist was nested too deeply. Nothing was saved.", "playlist");
  const got = await fetchMedia(url, VIDEO_HOSTS, fetchImpl, MAX_VIDEO_BYTES);
  const sniff = sniffBytes(got.bytes);
  if (sniff.kind === "video" && sniff.ext) return describeVideo(got.bytes, sniff.ext, sniff.mime, []);
  if (sniff.kind !== "playlist") {
    throw new UserVisibleError(
      "The address returned a web page or an unrecognized file instead of a video. Nothing was saved.",
      "not-video"
    );
  }
  const parsed = parsePlaylist(decodeText(got.bytes));
  if (parsed.encrypted) {
    throw new UserVisibleError(
      "This video uses an encrypted playlist. The extension does not bypass encryption. Nothing was saved.",
      "encrypted"
    );
  }
  if (parsed.kind === "master") {
    const variant = pickVariant(parsed.variants);
    if (!variant) throw new UserVisibleError("The video playlist had no playable variants. Nothing was saved.", "playlist");
    const next = resolvePlaylistUrl(got.url, variant.uri);
    const saved = await downloadChosen(next, fetchImpl, depth + 1);
    if (parsed.hasSeparateAudio || variant.audioGroup) {
      saved.notice += " The playlist lists audio separately, and this extension does not mux tracks, so the file may be silent.";
    }
    return saved;
  }
  if (!parsed.segments.length) {
    throw new UserVisibleError("The video playlist did not list any segments. Nothing was saved.", "playlist");
  }
  if (parsed.segments.length > MAX_SEGMENTS) {
    throw new UserVisibleError("The video playlist has more segments than this extension will download. Nothing was saved.", "playlist");
  }
  const parts = [];
  if (parsed.map) {
    parts.push(await fetchSegment(resolvePlaylistUrl(got.url, parsed.map.uri), parsed.map.byterange, fetchImpl));
  }
  const cursors = /* @__PURE__ */ new Map();
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
      "not-video"
    );
  }
  const warnings = [];
  if (parsed.hasSeparateAudio) {
    warnings.push(
      "The playlist lists audio separately, and this extension does not mux tracks, so the file may be silent."
    );
  }
  return describeVideo(bytes, combined.ext, combined.mime, warnings);
}
function describeVideo(bytes, ext, mime, warnings) {
  let notice = ext === "ts" ? "Saved the video as MPEG-TS (.ts), not MP4, because that is the stream format the page loaded. VLC and similar players can open it." : ext === "webm" ? "Saved the video as WebM." : "Saved the video.";
  if (warnings.length) notice = `${notice} ${warnings.join(" ")}`;
  return { bytes, ext, mime, notice };
}
async function fetchSegment(url, range, fetchImpl) {
  if (!range) {
    const got2 = await fetchMedia(url, VIDEO_HOSTS, fetchImpl, MAX_VIDEO_BYTES);
    rejectIfMarkup(got2.bytes);
    return got2.bytes;
  }
  const got = await fetchMedia(url, VIDEO_HOSTS, fetchImpl, MAX_VIDEO_BYTES, {
    Range: `bytes=${range.offset}-${range.offset + range.length - 1}`
  });
  rejectIfMarkup(got.bytes);
  if (got.status === 206 || got.bytes.byteLength === range.length) return got.bytes;
  if (got.bytes.byteLength >= range.offset + range.length) {
    return got.bytes.subarray(range.offset, range.offset + range.length);
  }
  return got.bytes;
}
function rejectIfMarkup(bytes) {
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 64)).trim().toLowerCase();
  if (head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<head") || head.startsWith("{") || head.startsWith("<?xml")) {
    throw new UserVisibleError(
      "A video segment was a web page instead of media. Nothing was saved.",
      "not-video"
    );
  }
}
async function fetchMedia(url, hosts, fetchImpl, maxBytes, headers) {
  const checked = assertMediaUrl(url, hosts);
  const response = await fetchImpl(checked.toString(), {
    credentials: "include",
    redirect: "follow",
    headers,
    signal: AbortSignal.timeout(45e3)
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
var OPEN_FILE = /\.(mp4|webm)(?:$|\?)/i;
async function resolveOpenableVideoUrl(urls, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const hosts = deps.hosts || VIDEO_HOSTS;
  return openableVideoUrl(urls, deps, hosts, fetchImpl, 0);
}
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
    const got = await fetchMedia(playlistUrl, hosts, fetchImpl, 2e6);
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
      "segmented"
    );
  }
  throw new UserVisibleError("No full video address was loaded by the page. Nothing was opened.", "no-video-url");
}
function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
function decodeText(bytes) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

// src/lib/filename.js
function assertDownloadFilename(filename) {
  if (typeof filename !== "string") {
    throw new UserVisibleError("Could not build a safe filename.", "bad-filename");
  }
  if (filename.length > 140 || /[\\/]/.test(filename) || filename.includes("..")) {
    throw new UserVisibleError("Could not build a safe filename.", "bad-filename");
  }
  if (!/^x-[a-z0-9.-]+$/i.test(filename)) {
    throw new UserVisibleError("Could not build a safe filename.", "bad-filename");
  }
  return filename;
}
function assertFilenameBase(base) {
  if (typeof base !== "string" || base.length > 100 || !/^x-[a-z0-9-]+$/i.test(base)) {
    throw new UserVisibleError("Could not build a safe filename.", "bad-filename");
  }
  return base;
}

// src/lib/messages.js
var MENU_ITEMS = [
  { id: "download-image", title: "Download full image from post" },
  { id: "open-image", title: "Open image in new tab" },
  { id: "post-image", title: "Post image" },
  { id: "download-video", title: "Download full video from post" },
  { id: "open-video", title: "Open video in new tab" },
  { id: "post-video", title: "Post video" },
  { id: "screenshot-post", title: "Screenshot post" }
];
var MENU_IDS = new Set(MENU_ITEMS.map((item) => item.id));
function parseDownloadImage(message, hosts = IMAGE_HOSTS) {
  const urls = readUrlList(message, "download-image", hosts, 6);
  const filenameBase = readBase(message);
  return { type: "download-image", urls, filenameBase };
}
function parseDownloadVideo(message) {
  const urls = readUrlList(message, "download-video", VIDEO_HOSTS, 8);
  const filenameBase = readBase(message);
  return { type: "download-video", urls, filenameBase };
}
function parseDownloadPng(message) {
  if (!message || typeof message !== "object") throw new UserVisibleError("Bad screenshot message.", "bad-message");
  const msg = (
    /** @type {Record<string, unknown>} */
    message
  );
  if (msg.type !== "download-png") throw new UserVisibleError("Bad screenshot message.", "bad-message");
  const filenameBase = assertFilenameBase(String(msg.filenameBase || ""));
  const bytes = typeof msg.base64 === "string" ? decodeBase64(msg.base64) : asBytes(msg.bytes);
  if (!bytes || bytes.byteLength < 8 || bytes.byteLength > 4e7) {
    throw new UserVisibleError("The screenshot was empty or too large to save.", "bad-message");
  }
  return { type: "download-png", filenameBase, bytes };
}
function encodeBase64(bytes) {
  let binary = "";
  const chunk = 16384;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
function decodeBase64(value) {
  if (typeof value !== "string" || value.length > 56e6) return null;
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
function readUrlList(message, type, hosts, max) {
  if (!message || typeof message !== "object") throw new UserVisibleError("Bad download message.", "bad-message");
  const msg = (
    /** @type {Record<string, unknown>} */
    message
  );
  if (msg.type !== type) throw new UserVisibleError("Bad download message.", "bad-message");
  if (!Array.isArray(msg.urls) || msg.urls.length === 0 || msg.urls.length > max) {
    throw new UserVisibleError("Bad download message.", "bad-message");
  }
  return msg.urls.map((url) => {
    if (typeof url !== "string" || url.length > 2e3) {
      throw new UserVisibleError("Bad download message.", "bad-message");
    }
    return assertMediaUrl(url, hosts).toString();
  });
}
function readBase(message) {
  const msg = (
    /** @type {Record<string, unknown>} */
    message
  );
  if (typeof msg.filenameBase !== "string") throw new UserVisibleError("Bad download message.", "bad-message");
  return assertFilenameBase(msg.filenameBase);
}
function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

// src/background/index.js
chrome.runtime.onInstalled.addListener(() => {
  installMenus().catch((error) => console.error("X Native Extension menu setup failed", error));
});
chrome.runtime.onStartup.addListener(() => {
  installMenus().catch((error) => console.error("X Native Extension menu setup failed", error));
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id || !isAllowedPageUrl(tab.url || info.pageUrl || "", chrome.runtime.getManifest())) return;
  if (!MENU_ITEMS.some((item) => item.id === info.menuItemId)) return;
  chrome.tabs.sendMessage(tab.id, { type: "context-action", action: info.menuItemId }).catch(() => {
    chrome.action.setBadgeText({ text: "!", tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: "#8a4b08", tabId: tab.id });
  });
});
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) return;
  const type = command === "arm-native-paste" ? "arm-native-paste" : command === "screenshot-post" ? "context-action" : "";
  if (!type) return;
  const message = command === "screenshot-post" ? { type, action: "screenshot-post" } : { type };
  try {
    await chrome.tabs.sendMessage(tab.id, message);
  } catch {
  }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  handleMessage(message, sender).then(sendResponse).catch((error) => {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : "The request failed. Nothing was saved."
    });
  });
  return true;
});
var pendingAttachments = /* @__PURE__ */ new Map();
var nextAttachment = null;
var ATTACH_LIMIT = 32e6;
chrome.tabs.onRemoved.addListener((tabId) => pendingAttachments.delete(tabId));
async function openMedia(message, sender) {
  assertContentSender(sender);
  const msg = (
    /** @type {{ kind?: string, urls?: string[] }} */
    message
  );
  const urls = Array.isArray(msg.urls) ? msg.urls.slice(0, 4) : [];
  if (!urls.length) throw new UserVisibleError("Nothing was opened.", "open");
  if (msg.kind === "image") {
    const hosts = imageHostsForManifest(chrome.runtime.getManifest());
    const opened = [];
    for (const url of urls) {
      const checked = assertMediaUrlSafe(url, hosts);
      await chrome.tabs.create({ url: checked, active: opened.length === 0 });
      opened.push(checked);
    }
    return { ok: true, urls: opened };
  }
  if (msg.kind === "video") {
    const url = await resolveOpenableVideoUrl(urls);
    await chrome.tabs.create({ url, active: true });
    return { ok: true, urls: [url] };
  }
  throw new UserVisibleError("Nothing was opened.", "open");
}
async function postMedia(message, sender) {
  assertContentSender(sender);
  const msg = (
    /** @type {{ kind?: string, items?: { urls?: string[], filenameBase?: string }[], preferNewTab?: boolean, fixtureComposer?: string }} */
    message
  );
  const items = Array.isArray(msg.items) ? msg.items.slice(0, 4) : [];
  const files = [];
  if (msg.kind === "image") {
    const hosts = imageHostsForManifest(chrome.runtime.getManifest());
    for (const item of items) {
      const parsed = parseDownloadImage({ type: "download-image", urls: item.urls, filenameBase: item.filenameBase }, hosts);
      const image = await resolveImage(parsed.urls, { hosts });
      files.push(await fileRecord(image.bytes, `${parsed.filenameBase}.${image.ext}`, image.mime));
    }
  } else if (msg.kind === "video") {
    const item = items[0];
    const parsed = parseDownloadVideo({ type: "download-video", urls: item?.urls, filenameBase: item?.filenameBase });
    const video = await resolveVideo(parsed.urls);
    if (video.ext !== "mp4" && video.ext !== "webm") {
      throw new UserVisibleError(
        "The composer can attach an MP4 or WebM file. This video was only available in another form, so nothing was attached.",
        "not-attachable"
      );
    }
    files.push(await fileRecord(video.bytes, `${parsed.filenameBase}.${video.ext}`, video.mime));
  } else {
    throw new UserVisibleError("Nothing was attached.", "attach");
  }
  if (!files.length) throw new UserVisibleError("Nothing was attached.", "attach");
  if (msg.preferNewTab) {
    const url = resolveComposerUrl(msg.fixtureComposer, chrome.runtime.getManifest());
    nextAttachment = { files, created: Date.now() };
    const tab = await chrome.tabs.create({ url, active: true });
    if (tab.id != null) pendingAttachments.set(tab.id, { files });
    return { ok: true, placed: "new-tab", filenames: files.map((file) => file.filename) };
  }
  return { ok: true, placed: "here", files };
}
function claimAttachment(sender) {
  assertContentSender(sender);
  const pending = sender.tab?.id != null ? pendingAttachments.get(sender.tab.id) : void 0;
  if (pending) {
    pendingAttachments.delete(sender.tab.id);
    nextAttachment = null;
    return { ok: true, files: pending.files };
  }
  if (nextAttachment && Date.now() - nextAttachment.created < 2e4) {
    const files = nextAttachment.files;
    nextAttachment = null;
    return { ok: true, files };
  }
  return { ok: true, empty: true };
}
function fileRecord(bytes, filename, mime) {
  if (bytes.byteLength > ATTACH_LIMIT) {
    throw new UserVisibleError(
      "The file is too large to attach from this extension. Nothing was attached.",
      "too-large"
    );
  }
  return { base64: encodeBase64(bytes), mime, filename: assertDownloadFilename(filename) };
}
function assertMediaUrlSafe(url, hosts) {
  return assertMediaUrl(url, hosts).toString();
}
async function syncMenus(message, sender) {
  assertContentSender(sender);
  const requested = new Set(
    Array.isArray(
      /** @type {{ actions?: unknown }} */
      message.actions
    ) ? (
      /** @type {{ actions: unknown[] }} */
      message.actions.filter((id) => MENU_ITEMS.some((item) => item.id === id))
    ) : []
  );
  await Promise.all(MENU_ITEMS.map((item) => chrome.contextMenus.update(item.id, { visible: requested.has(item.id) }).catch(() => {
  })));
  return { ok: true };
}
async function installMenus() {
  await chrome.contextMenus.removeAll();
  const patterns = ["https://x.com/*", "https://twitter.com/*"];
  if (manifestGrantsLocalFixtures(chrome.runtime.getManifest())) patterns.push("http://127.0.0.1/*");
  for (const item of MENU_ITEMS) {
    chrome.contextMenus.create({
      id: item.id,
      title: item.title,
      contexts: ["page", "selection", "image", "video", "link"],
      documentUrlPatterns: patterns
    });
  }
}
async function handleMessage(message, sender) {
  if (!message || typeof message !== "object") return { ok: false, error: "Bad message." };
  const type = (
    /** @type {{ type?: string }} */
    message.type
  );
  if (type === "sync-menus") return syncMenus(message, sender);
  if (type === "open-media") return openMedia(message, sender);
  if (type === "post-media") return postMedia(message, sender);
  if (type === "claim-attachment") return claimAttachment(sender);
  if (type === "capture-viewport") return captureViewport(sender);
  if (type === "download-image" || type === "download-video" || type === "download-png") {
    assertContentSender(sender);
    if (type === "download-image") {
      const hosts = imageHostsForManifest(chrome.runtime.getManifest());
      const parsed2 = parseDownloadImage(message, hosts);
      const image = await resolveImage(parsed2.urls, { hosts });
      const filename2 = assertDownloadFilename(`${parsed2.filenameBase}.${image.ext}`);
      await saveBytes(image.bytes, filename2, image.mime);
      return { ok: true, notice: image.notice, filename: `X-Native/${filename2}` };
    }
    if (type === "download-video") {
      const parsed2 = parseDownloadVideo(message);
      const video = await resolveVideo(parsed2.urls);
      const filename2 = assertDownloadFilename(`${parsed2.filenameBase}.${video.ext}`);
      await saveBytes(video.bytes, filename2, video.mime);
      return { ok: true, notice: video.notice, filename: `X-Native/${filename2}` };
    }
    const parsed = parseDownloadPng(message);
    const sniff = sniffBytes(parsed.bytes);
    if (sniff.kind !== "image" || sniff.ext !== "png") {
      throw new UserVisibleError("The screenshot was not a PNG. Nothing was saved.", "not-png");
    }
    const filename = assertDownloadFilename(`${parsed.filenameBase}.png`);
    await saveBytes(parsed.bytes, filename, "image/png");
    return { ok: true, filename: `X-Native/${filename}` };
  }
  return void 0;
}
function assertContentSender(sender) {
  if (!sender.tab?.id || !sender.tab.url || !isAllowedPageUrl(sender.tab.url, chrome.runtime.getManifest())) {
    throw new UserVisibleError("Refused a download request from an unexpected page.", "bad-sender");
  }
}
async function captureViewport(sender) {
  assertContentSender(sender);
  const dataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" });
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png")) {
    throw new UserVisibleError("The browser did not return a PNG screenshot.", "capture");
  }
  return { ok: true, dataUrl };
}
function saveBytes(bytes, filename, mime) {
  if (bytes.byteLength > 32e6) {
    return Promise.reject(
      new UserVisibleError(
        "The file is too large to hand to the download manager from this browser. Nothing was saved.",
        "too-large"
      )
    );
  }
  const url = `data:${mime};base64,${encodeBase64(bytes)}`;
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url,
        filename: `X-Native/${filename}`,
        saveAs: false,
        conflictAction: "uniquify"
      },
      (id) => {
        const failure = chrome.runtime.lastError;
        if (failure || id == null) {
          reject(new UserVisibleError(failure?.message || "The browser refused the download.", "download"));
          return;
        }
        let settled = false;
        let previousBytes = -1;
        let timer;
        const finish = (error) => {
          if (settled) return;
          settled = true;
          if (timer) clearInterval(timer);
          chrome.downloads.onChanged.removeListener(onChanged);
          if (error) reject(error);
          else resolve(id);
        };
        const inspect = async () => {
          const [item] = await chrome.downloads.search({ id });
          if (!item || settled) return;
          if (item.state === "interrupted") {
            finish(new UserVisibleError("The browser interrupted the download. Nothing was kept.", "download"));
            return;
          }
          if (item.state === "complete") {
            finish();
            return;
          }
          const received = item.bytesReceived || 0;
          const onDisk = Boolean(item.filename && item.exists && received > 0);
          const full = item.totalBytes <= 0 || received >= item.totalBytes;
          if (onDisk && full && received === previousBytes) finish();
          previousBytes = received;
        };
        const onChanged = (delta) => {
          if (delta.id === id) inspect();
        };
        chrome.downloads.onChanged.addListener(onChanged);
        timer = setInterval(inspect, 200);
        inspect();
        setTimeout(() => {
          finish(new UserVisibleError("The browser did not finish the download. Nothing was kept.", "download"));
        }, 15e3);
      }
    );
  });
}
