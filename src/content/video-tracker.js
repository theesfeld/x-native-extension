import { classifyVideoUrl } from "../lib/video-url.js";

/** @type {Set<{ video: Element, until: number }>} */
const armed = new Set();
/** @type {WeakMap<Element, Set<string>>} */
const buckets = new WeakMap();
/** @type {{ url: string, at: number }[]} */
const recent = [];

export function installVideoTracker() {
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        note(entry.name);
      }
    });
    observer.observe({ type: "resource", buffered: true });
  } catch {
    /* resource timing can be unavailable in odd frames */
  }

  const arm = (event) => {
    const target = event.target;
    if (!target || /** @type {Element} */ (target).tagName !== "VIDEO") return;
    const video = /** @type {Element} */ (target);
    const until = Date.now() + 8000;
    armed.add({ video, until });
    const bucket = bucketFor(video);
    const now = Date.now();
    for (const item of recent) {
      if (now - item.at < 3000) bucket.add(item.url);
    }
  };
  document.addEventListener("play", arm, true);
  document.addEventListener("loadeddata", arm, true);
  document.addEventListener("progress", arm, true);
}

/** @param {string} url */
function note(url) {
  if (!classifyVideoUrl(url)) return;
  recent.push({ url, at: Date.now() });
  if (recent.length > 200) recent.shift();
  const now = Date.now();
  for (const item of armed) {
    if (item.until < now || !item.video.isConnected) {
      armed.delete(item);
      continue;
    }
    bucketFor(item.video).add(url);
  }
}

/** @param {Element} video */
function bucketFor(video) {
  let bucket = buckets.get(video);
  if (!bucket) {
    bucket = new Set();
    buckets.set(video, bucket);
  }
  return bucket;
}

/** @param {Element} video */
export function playbackUrlsFor(video) {
  return [...(buckets.get(video) || [])];
}

/** URLs the page actually requested, newest last. */
export function observedVideoUrls() {
  return recent.map((item) => item.url);
}
