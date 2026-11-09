import { UserVisibleError } from "./errors.js";
import { assertFilenameBase } from "./filename.js";
import { assertMediaUrl, IMAGE_HOSTS, VIDEO_HOSTS } from "./hosts.js";

export const MENU_ITEMS = [
  { id: "download-image", title: "Download full image from post" },
  { id: "open-image", title: "Open image in new tab" },
  { id: "post-image", title: "Post image" },
  { id: "download-video", title: "Download full video from post" },
  { id: "open-video", title: "Open video in new tab" },
  { id: "post-video", title: "Post video" },
  { id: "screenshot-post", title: "Screenshot post" },
];

export const PRODUCTION_COMPOSER_URL = "https://x.com/compose/post";

const MENU_IDS = new Set(MENU_ITEMS.map((item) => item.id));

/**
 * @param {unknown} message
 * @returns {{ type: "context-action", action: string } | null}
 */
export function parseContextAction(message) {
  if (!message || typeof message !== "object") return null;
  const msg = /** @type {Record<string, unknown>} */ (message);
  if (msg.type !== "context-action") return null;
  if (typeof msg.action !== "string" || !MENU_IDS.has(msg.action)) return null;
  return { type: "context-action", action: msg.action };
}

/**
 * @param {unknown} message
 */
export function parseDownloadImage(message, hosts = IMAGE_HOSTS) {
  const urls = readUrlList(message, "download-image", hosts, 6);
  const filenameBase = readBase(message);
  return { type: "download-image", urls, filenameBase };
}

/**
 * @param {unknown} message
 */
export function parseDownloadVideo(message) {
  const urls = readUrlList(message, "download-video", VIDEO_HOSTS, 8);
  const filenameBase = readBase(message);
  return { type: "download-video", urls, filenameBase };
}

/**
 * @param {unknown} message
 */
export function parseDownloadPng(message) {
  if (!message || typeof message !== "object") throw new UserVisibleError("Bad screenshot message.", "bad-message");
  const msg = /** @type {Record<string, unknown>} */ (message);
  if (msg.type !== "download-png") throw new UserVisibleError("Bad screenshot message.", "bad-message");
  const filenameBase = assertFilenameBase(String(msg.filenameBase || ""));
  const bytes = typeof msg.base64 === "string" ? decodeBase64(msg.base64) : asBytes(msg.bytes);
  if (!bytes || bytes.byteLength < 8 || bytes.byteLength > 40_000_000) {
    throw new UserVisibleError("The screenshot was empty or too large to save.", "bad-message");
  }
  return { type: "download-png", filenameBase, bytes };
}

/** @param {Uint8Array} bytes */
export function encodeBase64(bytes) {
  let binary = "";
  const chunk = 0x4000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** @param {string} value */
export function decodeBase64(value) {
  if (typeof value !== "string" || value.length > 56_000_000) return null;
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * @param {unknown} message
 * @param {string} type
 * @param {string[]} hosts
 * @param {number} max
 */
function readUrlList(message, type, hosts, max) {
  if (!message || typeof message !== "object") throw new UserVisibleError("Bad download message.", "bad-message");
  const msg = /** @type {Record<string, unknown>} */ (message);
  if (msg.type !== type) throw new UserVisibleError("Bad download message.", "bad-message");
  if (!Array.isArray(msg.urls) || msg.urls.length === 0 || msg.urls.length > max) {
    throw new UserVisibleError("Bad download message.", "bad-message");
  }
  return msg.urls.map((url) => {
    if (typeof url !== "string" || url.length > 2000) {
      throw new UserVisibleError("Bad download message.", "bad-message");
    }
    return assertMediaUrl(url, hosts).toString();
  });
}

/** @param {unknown} message */
function readBase(message) {
  const msg = /** @type {Record<string, unknown>} */ (message);
  if (typeof msg.filenameBase !== "string") throw new UserVisibleError("Bad download message.", "bad-message");
  return assertFilenameBase(msg.filenameBase);
}

/** @param {unknown} value */
export function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}
