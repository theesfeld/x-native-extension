const IMAGE_EXT = {
  jpg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

const VIDEO_EXT = {
  mp4: "video/mp4",
  webm: "video/webm",
  ts: "video/mp2t",
};

/**
 * Identify a response body by magic bytes. Content-Type is not trusted:
 * an HTML or JSON body is never reported as a video or image.
 * @param {Uint8Array} bytes
 */
export function sniffBytes(bytes) {
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

/** @param {Uint8Array} data */
function looksLikeMarkup(data) {
  const head = decodeHead(data, 80).trim().toLowerCase();
  return (
    head.startsWith("<!doctype") ||
    head.startsWith("<html") ||
    head.startsWith("<head") ||
    head.startsWith("<body") ||
    head.startsWith("<svg") ||
    head.startsWith("{") ||
    head.startsWith("<?xml")
  );
}

/** @param {Uint8Array} data */
function isPng(data) {
  return data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47;
}

/** @param {Uint8Array} data */
function isJpeg(data) {
  return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
}

/** @param {Uint8Array} data */
function isGif(data) {
  return data.length >= 6 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x38;
}

/** @param {Uint8Array} data */
function isWebp(data) {
  return (
    data.length >= 12 &&
    data[0] === 0x52 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x46 &&
    data[8] === 0x57 &&
    data[9] === 0x45 &&
    data[10] === 0x42 &&
    data[11] === 0x50
  );
}

/** @param {Uint8Array} data */
function isWebm(data) {
  return data.length >= 4 && data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3;
}

/** ISO BMFF: size + "ftyp" or "styp" within the first 32 bytes. */
function isMp4(data) {
  const limit = Math.min(data.length - 4, 32);
  for (let i = 0; i < limit; i++) {
    if (data[i] === 0x66 && data[i + 1] === 0x74 && data[i + 2] === 0x79 && data[i + 3] === 0x70) return true;
    if (data[i] === 0x73 && data[i + 1] === 0x74 && data[i + 2] === 0x79 && data[i + 3] === 0x70) return true;
  }
  return false;
}

/** MPEG-TS sync byte 0x47 every 188 bytes, checked for a few packets. */
function isMpegTs(data) {
  if (data.length < 188 || data[0] !== 0x47) return false;
  const packets = Math.min(3, Math.floor(data.length / 188));
  for (let i = 0; i < packets; i++) {
    if (data[i * 188] !== 0x47) return false;
  }
  return packets >= 1;
}

/** @param {Uint8Array} data */
function isPlaylist(data) {
  const head = decodeHead(data, 16).replace(/^\uFEFF/, "").trimStart();
  return head.startsWith("#EXTM3U");
}

/**
 * @param {Uint8Array} data
 * @param {number} length
 */
function decodeHead(data, length) {
  const slice = data.subarray(0, Math.min(data.length, length));
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(slice);
  } catch {
    return "";
  }
}
