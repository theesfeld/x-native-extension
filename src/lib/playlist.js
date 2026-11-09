/**
 * @typedef {{ bandwidth: number, width: number, height: number, audioGroup: string, uri: string }} Variant
 * @typedef {{ uri: string, byterange: { length: number, offset: number | null } | null }} Segment
 * @typedef {{ uri: string, byterange: { length: number, offset: number } | null }} MapSegment
 */

/**
 * Parse an HLS playlist. Throws if the text is not a playlist.
 * @param {string} text
 */
export function parsePlaylist(text) {
  if (typeof text !== "string") throw new Error("Playlist was not text");
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length || !lines[0].startsWith("#EXTM3U")) throw new Error("Not an HLS playlist");

  let encrypted = false;
  let hasSeparateAudio = false;
  /** @type {Variant[]} */
  const variants = [];
  /** @type {Segment[]} */
  const segments = [];
  /** @type {MapSegment | null} */
  let map = null;
  /** @type {{ length: number, offset: number | null } | null} */
  let pendingRange = null;
  /** @type {"variant" | "segment" | null} */
  let expectUriFor = null;
  /** @type {Omit<Variant, "uri"> | null} */
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
        audioGroup: /AUDIO="([^"]*)"/.exec(line)?.[1] || "",
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
          byterange: range ? { length: Number(range[1]), offset: range[2] ? Number(range[2]) : 0 } : null,
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
    map,
  };
}

/** @param {Variant[]} variants */
export function pickVariant(variants) {
  if (!variants.length) return null;
  return [...variants].sort((a, b) => {
    const area = b.width * b.height - a.width * a.height;
    if (area !== 0) return area;
    return b.bandwidth - a.bandwidth;
  })[0];
}

/**
 * @param {string} base
 * @param {string} relative
 */
export function resolvePlaylistUrl(base, relative) {
  return new URL(relative, base).toString();
}
