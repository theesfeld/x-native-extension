export const POST_SELECTOR = [
  "article[data-testid='tweet']",
  "[data-testid='tweet']",
  "article[role='article']",
  "[data-testid='quoteTweet']",
  // Logged-out x.com in Nov 2026 renders posts as plain <article> elements,
  // with the status id on a parent [data-href]. Older test ids are still listed.
  "article",
].join(", ");

const COMPOSER_SELECTOR = [
  "[data-testid='tweetTextarea_0']",
  "[data-testid^='tweetTextarea_']",
  "[data-testid='tweetTextarea']",
  "[data-testid='dmComposerTextInput']",
  "[data-testid='dmComposerTextInputRichText']",
].join(", ");

const REJECT_SELECTOR = [
  "[data-testid='SearchBox_Search_Input']",
  "[role='search']",
  "input[type='password']",
  "input[type='email']",
  "input[type='file']",
  "input[type='hidden']",
].join(", ");

const LABEL_RE = /(post text|tweet text|\breply\b|what.?s happening|add a comment|unsent post|unsent tweet)/i;

/**
 * @param {Event} event
 * @returns {Element | null}
 */
export function elementFromEvent(event) {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  for (const node of path) {
    if (node && /** @type {Node} */ (node).nodeType === 1) return /** @type {Element} */ (node);
  }
  const target = event.target;
  if (target && /** @type {Node} */ (target).nodeType === 1) return /** @type {Element} */ (target);
  return null;
}

/**
 * Innermost post or quote container.
 * @param {Element | null | undefined} target
 */
export function findPostRoot(target) {
  if (!target || typeof target.closest !== "function") return null;
  return target.closest(POST_SELECTOR);
}

/**
 * @param {Element | null | undefined} node
 * @returns {HTMLElement | null}
 */
export function findComposerEditable(node) {
  if (!node || typeof node.closest !== "function") return null;
  if (node.closest(REJECT_SELECTOR)) return null;
  const editable = node.closest("[contenteditable='true'], textarea, input");
  if (!editable || typeof editable.closest !== "function") return null;
  if (editable.closest(REJECT_SELECTOR)) return null;
  const tag = editable.tagName;
  if (tag === "INPUT") {
    const type = (editable.getAttribute("type") || "text").toLowerCase();
    if (type !== "text" && type !== "search") return null;
  }
  if (editable.closest(COMPOSER_SELECTOR)) return /** @type {HTMLElement} */ (editable);
  const label = `${editable.getAttribute("aria-label") || ""} ${editable.getAttribute("aria-description") || ""}`;
  if (LABEL_RE.test(label) && !/search/i.test(label)) return /** @type {HTMLElement} */ (editable);
  return null;
}

/**
 * @param {Element} img
 * @param {Element} post
 */
const VIDEO_PLAYER_SELECTOR = "video, [data-testid='videoPlayer'], [data-testid='videoComponent']";
const VIDEO_THUMB_RE = /\/(amplify_video_thumb|ext_tw_video_thumb|tweet_video_thumb|amplify_video|ext_tw_video|tweet_video)\/;

/** @param {string} src */
export function isVideoThumbUrl(src) {
  return VIDEO_THUMB_RE.test(src || "");
}

/**
 * A still inside a player, or a known video-thumb URL. Not a post photo.
 * @param {Element | null | undefined} node
 * @param {Element} post
 */
export function isVideoSurface(node, post) {
  if (!node || typeof node.closest !== "function" || !post) return false;
  const player = node.closest(VIDEO_PLAYER_SELECTOR);
  if (player && post.contains(player) && player.closest(POST_SELECTOR) === post) return true;
  const img = node.tagName === "IMG" ? node : node.closest("img");
  if (!img || img.closest(POST_SELECTOR) !== post) return false;
  return isVideoThumbUrl(imageSource(img));
}

export function isPostPhoto(img, post, options = {}) {
  if (!img || img.tagName !== "IMG") return false;
  if (typeof img.closest !== "function" || img.closest(POST_SELECTOR) !== post) return false;
  if (isVideoSurface(img, post)) return false;
  const src = imageSource(img);
  if (src.includes("://pbs.twimg.com/media/")) return true;
  return Boolean(options.allowLocal && /^http:\/\/(127\.0\.0\.1|localhost)(?::\d+)?\/media\//.test(src));
}

/** @param {Element} img */
export function imageSource(img) {
  const image = /** @type {HTMLImageElement} */ (img);
  return image.currentSrc || image.src || img.getAttribute("src") || "";
}

/**
 * @param {Element | null | undefined} target
 * @param {Element} post
 */
export function findTargetedImage(target, post, options = {}) {
  if (!target || typeof target.closest !== "function") return null;
  const img = target.closest("img");
  if (img && isPostPhoto(img, post, options)) return img;
  const photo = target.closest("[data-testid='tweetPhoto']");
  if (photo && post.contains(photo) && photo.closest(POST_SELECTOR) === post) {
    const inner = photo.querySelector("img");
    if (inner && isPostPhoto(inner, post, options)) return inner;
  }
  return null;
}

/** @param {Element} post */
export function collectPostImages(post, options = {}) {
  return [...post.querySelectorAll("img")].filter((img) => isPostPhoto(img, post, options));
}

/**
 * A player, a not-yet-mounted video, or a poster still. Quoted players are excluded.
 * @param {Element} post
 */
export function postHasVideo(post) {
  if (!post) return false;
  for (const node of post.querySelectorAll(`${VIDEO_PLAYER_SELECTOR}, img`)) {
    if (node.closest(POST_SELECTOR) !== post) continue;
    if (node.tagName === "IMG") {
      if (isVideoThumbUrl(imageSource(node)) || node.closest(VIDEO_PLAYER_SELECTOR)) return true;
      continue;
    }
    return true;
  }
  return false;
}

/**
 * photo: the pointer is on a real post photo.
 * video: the pointer is on a player, an overlay inside it, or its poster.
 * body: text, avatar, emoji, or other chrome. Media then comes from this post only.
 * @param {Element | null | undefined} target
 * @param {Element} post
 * @param {{ allowLocal?: boolean }} [options]
 * @returns {"photo" | "video" | "body"}
 */
export function classifyMediaTarget(target, post, options = {}) {
  if (!target || !post) return "body";
  if (isVideoSurface(target, post)) return "video";
  if (findTargetedImage(target, post, options)) return "photo";
  return "body";
}

/**
 * @param {Element | null | undefined} target
 * @param {Element} post
 * @returns {{ video: Element | null, reason: "targeted" | "only" | "none" | "many" }}
 */
export function findTargetVideo(target, post) {
  const direct = target && typeof target.closest === "function"
    ? target.closest("video, [data-testid='videoPlayer'], [data-testid='videoComponent']")
    : null;
  if (direct && post.contains(direct) && direct.closest(POST_SELECTOR) === post) {
    const video = direct.tagName === "VIDEO" ? direct : direct.querySelector("video");
    if (video && video.closest(POST_SELECTOR) === post) return { video, reason: "targeted" };
    return { video: null, reason: "none" };
  }
  const videos = [...post.querySelectorAll("video")].filter((video) => video.closest(POST_SELECTOR) === post);
  if (videos.length === 1) return { video: videos[0], reason: "only" };
  if (videos.length === 0) return { video: null, reason: "none" };
  return { video: null, reason: "many" };
}

/** @param {Element | null | undefined} node */
function statusHref(node) {
  if (!node || typeof node.getAttribute !== "function") return "";
  return node.getAttribute("href") || node.getAttribute("data-href") || "";
}

/** @param {Element} post */
export function findStatusId(post) {
  for (const link of post.querySelectorAll("a[href*='/status/'], [data-href*='/status/']")) {
    if (link.closest(POST_SELECTOR) !== post) continue;
    if (link.querySelector(POST_SELECTOR)) continue;
    const match = statusHref(link).match(/\/status\/(\d{5,22})(?:\b|\/|$|\?|#)/);
    if (match) return match[1];
  }
  let node = post;
  for (let i = 0; i < 6 && node; i++) {
    const match = statusHref(node).match(/\/status\/(\d{5,22})(?:\b|\/|$|\?|#)/);
    if (match) return match[1];
    node = node.parentElement;
  }
  return null;
}

/**
 * @param {Element} video
 * @returns {string[]}
 */
export function directVideoUrls(video) {
  const urls = [];
  const current = /** @type {HTMLVideoElement} */ (video).currentSrc || video.getAttribute("src") || "";
  if (current.startsWith("https://")) urls.push(current);
  for (const source of video.querySelectorAll("source")) {
    const src = source.getAttribute("src") || "";
    if (src.startsWith("https://")) urls.push(src);
  }
  return urls;
}

/**
 * Poster and nearby image URLs used only as id hints, never as download URLs.
 * @param {Element} video
 */
export function videoHints(video) {
  const hints = [];
  const poster = video.getAttribute("poster") || "";
  if (poster) hints.push(poster);
  const player = (typeof video.closest === "function" &&
    video.closest("[data-testid='videoPlayer'], [data-testid='videoComponent']")) ||
    video.parentElement;
  if (player) {
    for (const img of player.querySelectorAll("img")) {
      const src = imageSource(img);
      if (src) hints.push(src);
    }
  }
  return hints;
}
