import { sniffBytes } from "../lib/sniff.js";

/**
 * Capture the post with captureVisibleTab, scrolling and cropping until the
 * rendered post is covered. Restores scroll and any visibility tweaks.
 * @param {Element} post
 * @param {{ setToastHidden: (hidden: boolean) => void }} deps
 */
export async function capturePostPng(post, deps) {
  const doc = post.ownerDocument;
  const view = doc.defaultView;
  if (!view) throw new Error("No window");
  const savedX = view.scrollX;
  const savedY = view.scrollY;
  const restoreVisibility = hideOverlappingChrome(post, view);
  deps.setToastHidden(true);
  try {
    let rect = post.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) {
      throw new Error("The post has no visible size to capture.");
    }
    if (rect.left < 0 || rect.right > view.innerWidth) {
      view.scrollTo(view.scrollX + rect.left - 8, view.scrollY);
      await nextFrames();
    }
    // Line the post up with the top of the window, then advance by whatever
    // was actually captured. Planned scroll positions run past the document
    // and leave a seam when the browser clamps them.
    rect = post.getBoundingClientRect();
    view.scrollTo(view.scrollX, view.scrollY + rect.top);
    await nextFrames();

    const totalHeight = post.getBoundingClientRect().height;
    const dpr = view.devicePixelRatio || 1;
    const maxCss = Math.floor(12000 / dpr);
    /** @type {{ bitmap: CanvasImageSource, box: { x: number, y: number, w: number, h: number }, scaleX: number, scaleY: number }[]} */
    const shots = [];
    let covered = 0;
    let truncated = false;
    let widthClipped = false;
    let previousScroll = -1;
    for (let i = 0; i < 8 && covered < totalHeight - 1; i++) {
      rect = post.getBoundingClientRect();
      const viewLeft = Math.max(rect.left, 0);
      const viewRight = Math.min(rect.right, view.innerWidth);
      const viewWidth = viewRight - viewLeft;
      if (rect.left < -0.5 || rect.right > view.innerWidth + 0.5) widthClipped = true;
      const viewTop = Math.max(rect.top, 0);
      const viewBottom = Math.min(rect.bottom, view.innerHeight);
      const intoPost = viewTop - rect.top;
      const overlap = Math.max(0, covered - intoPost);
      const sliceTop = viewTop + overlap;
      const sliceHeight = viewBottom - sliceTop;
      if (viewWidth < 1 || sliceHeight < 1) break;
      if (covered + sliceHeight > maxCss + 0.5) {
        truncated = true;
        break;
      }
      const dataUrl = await requestCapture();
      const image = await loadImage(dataUrl);
      if (!image.width || !image.height) throw new Error("The screenshot image was empty.");
      shots.push({
        bitmap: image.source,
        box: { x: viewLeft, y: sliceTop, w: viewWidth, h: sliceHeight },
        scaleX: image.width / view.innerWidth,
        scaleY: image.height / view.innerHeight,
      });
      covered += sliceHeight;
      if (rect.bottom <= view.innerHeight + 0.5) break;
      const before = view.scrollY;
      if (before === previousScroll) break;
      previousScroll = before;
      view.scrollTo(view.scrollX, before + sliceHeight);
      await nextFrames();
      if (Math.abs(view.scrollY - before) < 0.5) {
        // The window cannot scroll further. Loop once more so the overlap
        // math records the remaining visible tail, then stop.
        previousScroll = view.scrollY;
      }
    }
    if (!shots.length) throw new Error("The post is outside the window and could not be lined up.");
    if (covered < totalHeight - 2) truncated = true;
    const png = await stitch(shots);
    const sniff = sniffBytes(png);
    if (sniff.kind !== "image" || sniff.ext !== "png") {
      throw new Error("The capture was not a PNG. Nothing was saved.");
    }
    return { png, truncated, widthClipped };
  } finally {
    restoreVisibility();
    deps.setToastHidden(false);
    view.scrollTo(savedX, savedY);
  }
}

async function requestCapture() {
  const response = await chrome.runtime.sendMessage({ type: "capture-viewport" });
  if (!response?.ok || typeof response.dataUrl !== "string" || !response.dataUrl.startsWith("data:image/png")) {
    throw new Error(response?.error || "The browser did not return a screenshot.");
  }
  return response.dataUrl;
}

/**
 * @param {{ bitmap: CanvasImageSource, box: { x: number, y: number, w: number, h: number }, scaleX: number, scaleY: number }[]} shots
 */
async function stitch(shots) {
  const first = shots[0];
  const width = Math.max(1, Math.round(first.box.w * first.scaleX));
  let height = 0;
  for (const shot of shots) height += Math.max(1, Math.round(shot.box.h * shot.scaleY));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the screenshot.");
  let destY = 0;
  for (const shot of shots) {
    const sw = Math.max(1, Math.round(shot.box.w * shot.scaleX));
    const sh = Math.max(1, Math.round(shot.box.h * shot.scaleY));
    ctx.drawImage(
      shot.bitmap,
      Math.round(shot.box.x * shot.scaleX),
      Math.round(shot.box.y * shot.scaleY),
      sw,
      sh,
      0,
      destY,
      Math.min(sw, width),
      sh,
    );
    destY += sh;
  }
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not encode the screenshot as PNG.");
  return new Uint8Array(await blob.arrayBuffer());
}

/** @param {string} dataUrl */
function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Could not read the screenshot image."));
    image.src = dataUrl;
  });
}

function nextFrames() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 60)));
  });
}

/**
 * Hide fixed and sticky chrome that would paint over the post. Ancestors of
 * the post stay visible. visibility does not change layout.
 * @param {Element} post
 * @param {Window} view
 */
function hideOverlappingChrome(post, view) {
  /** @type {[HTMLElement, string][]} */
  const hidden = [];
  const nodes = document.body ? document.body.querySelectorAll("*") : [];
  let checked = 0;
  for (const node of nodes) {
    if (++checked > 2500) break;
    if (node.nodeType !== 1) continue;
    const element = /** @type {HTMLElement} */ (node);
    if (element.id === "x-native-extension-toast" || element.id === "x-native-extension-menu") continue;
    if (post.contains(node) || node.contains(post)) continue;
    const position = view.getComputedStyle(element).position;
    if (position !== "fixed" && position !== "sticky") continue;
    const rect = element.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 12 || rect.height > view.innerHeight * 0.45) continue;
    hidden.push([element, element.style.visibility]);
    element.style.visibility = "hidden";
  }
  return () => {
    for (const [node, previous] of hidden) node.style.visibility = previous;
  };
}
