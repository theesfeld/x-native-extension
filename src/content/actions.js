import { captureNeedsInvocation, contextMenuMode, menuActionIds } from "../lib/context-menu-policy.js";
import { UserVisibleError } from "../lib/errors.js";
import { filenameBaseForStatus } from "../lib/filename.js";
import { manifestGrantsLocalFixtures } from "../lib/hosts.js";
import { imageCandidateUrls } from "../lib/image-url.js";
import { decodeBase64, encodeBase64, parseContextAction } from "../lib/messages.js";
import {
  classifyMediaTarget,
  collectPostImages,
  directVideoUrls,
  elementFromEvent,
  findComposerEditable,
  findPostRoot,
  findStatusId,
  findTargetedImage,
  findTargetVideo,
  imageSource,
  postHasVideo,
  POST_SELECTOR,
  videoHints,
} from "../lib/post-dom.js";
import { collectVideoUrls } from "../lib/video-url.js";
import { attachFiles, findEmptyComposerInput, isComposerPage, pageHasDraft } from "./composer.js";
import { createPageMenu } from "./page-menu.js";
import { capturePostPng } from "./screenshot.js";
import { observedVideoUrls, playbackUrlsFor } from "./video-tracker.js";

/** @type {ReturnType<typeof createPageMenu> | null} */
let pageMenu = null;

const CAPTURE_HINT = "Chrome blocked the screenshot. A button drawn on the page cannot grant it. Press Alt+Shift+S, or Alt+right-click and choose Screenshot post in the browser menu.";

/**
 * @param {{ showToast: (message: string) => void, setToastHidden: (hidden: boolean) => void }} deps
 */
export function installActions(deps) {
  /** @type {{ at: number, post: Element | null, target: Element | null } | null} */
  let lastContext = null;
  pageMenu = createPageMenu({
    onAction(action) {
      const context = lastContext;
      pageMenu?.hide();
      run(action, context, deps).catch((error) => {
        deps.showToast(error instanceof Error ? error.message : "Something went wrong. Nothing was saved.");
      });
    },
  });

  const onPointer = (event) => {
    if (event.type !== "contextmenu" && event.button !== 2) return;
    const target = elementFromEvent(event);
    if (eventInMenu(event)) return;
    const post = target && !findComposerEditable(target) ? findPostRoot(target) : null;
    const mode = contextMenuMode({
      shiftKey: Boolean(event.shiftKey),
      altKey: Boolean(event.altKey),
      hasPost: Boolean(post),
    });
    if (document.documentElement) {
      document.documentElement.dataset.xneMenuMode = mode;
      if (event.type === "contextmenu") document.documentElement.dataset.xneClickTrusted = event.isTrusted ? "1" : "0";
    }
    const actions = post ? actionsFor(target, post) : [];
    publishMenuActions(actions);
    if (mode === "ignore" || mode === "site") {
      if (event.type === "contextmenu") pageMenu?.hide();
      return;
    }
    event.stopImmediatePropagation();
    if (event.type !== "contextmenu") return;
    lastContext = { at: Date.now(), post, target, actions };
    if (mode === "extension") event.preventDefault();
    pageMenu.show(event.clientX || 8, event.clientY || 8, actions);
  };
  document.addEventListener("pointerdown", onPointer, true);
  document.addEventListener("mousedown", onPointer, true);
  document.addEventListener("contextmenu", onPointer, true);
  if (isComposerPage(location.href)) void claimPending(deps);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const action = parseContextAction(message);
    if (!action) return;
    sendResponse({ ok: true });
    run(action.action, lastContext, deps).catch((error) => {
      deps.showToast(error instanceof Error ? error.message : "Something went wrong. Nothing was saved.");
    });
  });
}

/**
 * @param {string} action
 * @param {{ at: number, post: Element | null, target: Element | null } | null} context
 * @param {{ showToast: (message: string) => void, setToastHidden: (hidden: boolean) => void }} deps
 */
async function run(action, context, deps) {
  const post = requirePost(context);
  if (action === "download-image") await downloadImages(post, context.target, deps.showToast);
  else if (action === "download-video") await downloadVideo(post, context.target, deps.showToast);
  else if (action === "open-image") await openImages(post, context.target, deps.showToast);
  else if (action === "open-video") await openVideo(post, context.target, deps.showToast);
  else if (action === "post-image") await postImages(post, context.target, deps.showToast);
  else if (action === "post-video") await postVideo(post, context.target, deps.showToast);
  else if (action === "screenshot-post") await screenshot(post, deps);
}

/**
 * @param {{ at: number, post: Element | null, target: Element | null } | null} context
 */
function requirePost(context) {
  if (!context || Date.now() - context.at > 15000) {
    throw new UserVisibleError("Right-click the post again, then choose the menu item. The previous click expired.");
  }
  if (!context.post || context.post.isConnected === false) {
    throw new UserVisibleError("No post was under that click. Right-click the post or its media and try again.");
  }
  return context.post;
}

/**
 * @param {Element} post
 * @param {Element | null} target
 * @param {(message: string) => void} showToast
 */
async function downloadImages(post, target, showToast) {
  const options = imageOptions();
  const targeted = target ? findTargetedImage(target, post, options) : null;
  const images = targeted ? [targeted] : collectPostImages(post, options);
  if (!images.length) {
    throw new UserVisibleError(
      "No post photo is under that click. Profile pictures, link cards, and video posters are left alone. Nothing was saved.",
    );
  }
  const statusId = findStatusId(post);
  /** @type {string[]} */
  const chosen = [];
  for (const img of images) chosen.push(...imageCandidateUrls(imageSource(img), options));
  mark(chosen.join(" "));
  for (let index = 0; index < images.length; index++) {
    const src = imageSource(images[index]);
    const urls = imageCandidateUrls(src, options);
    if (!urls.length) {
      showToast("Could not find a full-size image address in the page. Nothing was saved.");
      continue;
    }
    const filenameBase = filenameBaseForStatus(statusId, "image", images.length > 1 ? index + 1 : 0);
    const response = await chrome.runtime.sendMessage({ type: "download-image", urls, filenameBase });
    if (!response?.ok) {
      showToast(response?.error || "Image download failed. Nothing was saved.");
      continue;
    }
    showToast(`${response.notice} ${response.filename}`);
  }
}

/**
 * @param {Element} post
 * @param {Element | null} target
 * @param {(message: string) => void} showToast
 */
async function downloadVideo(post, target, showToast) {
  const found = findTargetVideo(target, post);
  if (!found.video) {
    if (found.reason === "many") {
      throw new UserVisibleError("Several videos are in this post. Right-click the video itself.");
    }
    if (postHasVideo(post)) {
      throw new UserVisibleError(
        "The full video file was not loaded by the page. The player is using a poster or a media buffer, which is not the whole file, so nothing was saved. Start playback, wait until the video is actually playing, then right-click the video and try again.",
      );
    }
    throw new UserVisibleError("No video was found in the post you right-clicked. Nothing was saved.");
  }
  const videos = [...post.querySelectorAll("video")].filter((video) => video.closest(POST_SELECTOR) === post);
  const urls = collectVideoUrls({
    hints: videoHints(found.video),
    directUrls: directVideoUrls(found.video),
    observedUrls: observedVideoUrls(),
    playbackUrls: playbackUrlsFor(found.video),
    playbackExclusive: videos.length <= 1,
  });
  mark(urls.join(" "));
  if (!urls.length) {
    const src = found.video.getAttribute("src") || /** @type {HTMLVideoElement} */ (found.video).currentSrc || "";
    if (src.startsWith("blob:")) {
      throw new UserVisibleError(
        "The full video file was not loaded by the page. The player is using a blob or media-buffer address, which is not the whole file, so nothing was saved. Start playback, wait until the video is actually playing, then right-click the video and try again.",
      );
    }
    throw new UserVisibleError(
      "The full video file was not loaded by the page. Start playback, wait until the video is actually playing, then right-click the video and try again. Nothing was saved.",
    );
  }
  const filenameBase = filenameBaseForStatus(findStatusId(post), "video", 0);
  const response = await chrome.runtime.sendMessage({ type: "download-video", urls, filenameBase });
  if (!response?.ok) throw new UserVisibleError(response?.error || "Video download failed. Nothing was saved.");
  showToast(`${response.notice} ${response.filename}`);
}

/**
 * @param {Element} post
 * @param {{ showToast: (message: string) => void, setToastHidden: (hidden: boolean) => void }} deps
 */
async function screenshot(post, deps) {
  pageMenu?.hide();
  deps.showToast("Capturing the post…");
  let shot;
  try {
    shot = await capturePostPng(post, deps);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (captureNeedsInvocation(message)) throw new UserVisibleError(CAPTURE_HINT, "needs-invocation");
    throw error;
  }
  const filenameBase = filenameBaseForStatus(findStatusId(post), "screenshot", 0);
  const response = await chrome.runtime.sendMessage({
    type: "download-png",
    filenameBase,
    base64: encodeBase64(shot.png),
  });
  if (!response?.ok) throw new UserVisibleError(response?.error || "Could not save the screenshot.");
  let notice = "Saved a PNG of the post.";
  if (shot.truncated) notice = "Saved a PNG of the top of the post. The rest was too tall to capture in one image.";
  else if (shot.widthClipped) notice = "Saved a PNG of the visible width. The post is wider than the window.";
  deps.showToast(`${notice} ${response.filename}`);
  mark(`screenshot:${response.filename}`);
}

/** @param {string} value */
/**
 * @param {Element} target
 * @param {Element} post
 */
/**
 * @param {Element} post
 * @param {Element | null} target
 */
function chosenImages(post, target) {
  const options = imageOptions();
  const targeted = target ? findTargetedImage(target, post, options) : null;
  const images = targeted ? [targeted] : collectPostImages(post, options);
  return { images: images.slice(0, 4), extra: Math.max(0, images.length - 4), options };
}

/**
 * @param {Element} post
 * @param {Element | null} target
 * @param {(message: string) => void} showToast
 */
async function openImages(post, target, showToast) {
  const chosen = chosenImages(post, target);
  if (!chosen.images.length) {
    throw new UserVisibleError("No post photo is under that click. Nothing was opened.");
  }
  const urls = chosen.images
    .map((img) => imageCandidateUrls(imageSource(img), chosen.options)[0])
    .filter(Boolean);
  const response = await chrome.runtime.sendMessage({ type: "open-media", kind: "image", urls });
  if (!response?.ok) throw new UserVisibleError(response?.error || "Nothing was opened.");
  const count = response.urls?.length || urls.length;
  const more = chosen.extra ? ` ${chosen.extra} more were left out because a post can show four images.` : "";
  showToast(count === 1 ? `Opened the full image in a new tab.${more}` : `Opened ${count} full images in new tabs.${more}`);
}

/**
 * @param {Element} post
 * @param {Element | null} target
 * @param {(message: string) => void} showToast
 */
async function openVideo(post, target, showToast) {
  const urls = videoCandidateUrls(post, target);
  const response = await chrome.runtime.sendMessage({ type: "open-media", kind: "video", urls });
  if (!response?.ok) throw new UserVisibleError(response?.error || "Nothing was opened.");
  showToast("Opened the video file in a new tab.");
}

/**
 * @param {Element} post
 * @param {Element | null} target
 * @param {(message: string) => void} showToast
 */
async function postImages(post, target, showToast) {
  const chosen = chosenImages(post, target);
  if (!chosen.images.length) throw new UserVisibleError("No post photo is under that click. Nothing was attached.");
  const statusId = findStatusId(post);
  const items = chosen.images.map((img, index) => ({
    urls: imageCandidateUrls(imageSource(img), chosen.options),
    filenameBase: filenameBaseForStatus(statusId, "image", chosen.images.length > 1 ? index + 1 : 0),
  }));
  await sendPost(post, "image", items, showToast, chosen.extra);
}

/**
 * @param {Element} post
 * @param {Element | null} target
 * @param {(message: string) => void} showToast
 */
async function postVideo(post, target, showToast) {
  const urls = videoCandidateUrls(post, target);
  const items = [{ urls, filenameBase: filenameBaseForStatus(findStatusId(post), "video", 0) }];
  await sendPost(post, "video", items, showToast, 0);
}

/**
 * @param {Element} post
 * @param {"image" | "video"} kind
 * @param {{ urls: string[], filenameBase: string }[]} items
 * @param {(message: string) => void} showToast
 * @param {number} extra
 */
async function sendPost(post, kind, items, showToast, extra) {
  const preferNewTab = pageHasDraft(document);
  const response = await chrome.runtime.sendMessage({
    type: "post-media",
    kind,
    items,
    preferNewTab,
    fixtureComposer: imageOptions().allowLocal ? `${location.origin}/compose-fixture` : "",
  });
  if (!response?.ok) throw new UserVisibleError(response?.error || "Nothing was attached.");
  const more = extra ? ` ${extra} more were left out.` : "";
  if (response.placed === "new-tab") {
    showToast(`A draft is already open here, so the media was sent to a new composer.${more} Nothing was posted.`);
    return;
  }
  const attached = applyAttachment(response.files);
  if (!attached.count) throw new UserVisibleError("The composer did not accept the file. Nothing was attached.");
  showToast(`Attached ${attached.names.join(", ")} for review.${more} Nothing was posted.`);
  mark(`attached:${attached.names.join(",")}`);
}

/**
 * @param {{ base64: string, mime: string, filename: string }[]} records
 */
function applyAttachment(records) {
  const input = findEmptyComposerInput(document);
  if (!input) throw new UserVisibleError("Couldn't find an empty composer file picker. Nothing was attached.");
  const files = records.map((record) => new File([decodeBase64(record.base64)], record.filename, { type: record.mime }));
  const result = attachFiles(input, files);
  if (document.documentElement) document.documentElement.dataset.xneChangeTrusted = result.changeTrusted ? "1" : "0";
  return result;
}

/**
 * @param {Element} post
 * @param {Element | null} target
 */
function videoCandidateUrls(post, target) {
  const found = findTargetVideo(target, post);
  if (!found.video) {
    if (postHasVideo(post)) {
      throw new UserVisibleError(
        "No full video address was loaded by the page. Start playback, then try again. Nothing was opened.",
      );
    }
    throw new UserVisibleError("No video was found in the post you right-clicked. Nothing was opened.");
  }
  const urls = collectVideoUrls({
    hints: videoHints(found.video),
    directUrls: directVideoUrls(found.video),
    observedUrls: observedVideoUrls(),
    playbackUrls: playbackUrlsFor(found.video),
    playbackExclusive: true,
  });
  if (!urls.length) {
    const src = found.video.getAttribute("src") || /** @type {HTMLVideoElement} */ (found.video).currentSrc || "";
    if (src.startsWith("blob:")) {
      throw new UserVisibleError(
        "This video is only a blob address in the page, which another tab cannot open and the composer cannot attach. Start playback so a file address loads, then try again. Nothing was opened.",
      );
    }
    throw new UserVisibleError("No full video address was loaded by the page. Nothing was opened.");
  }
  return urls;
}

/**
 * @param {{ showToast: (message: string) => void }} deps
 */
async function claimPending(deps) {
  try {
    await claimPendingOnce(deps);
  } catch (error) {
    deps.showToast(error instanceof Error ? error.message : "Nothing was attached.");
  }
}

/**
 * @param {{ showToast: (message: string) => void }} deps
 */
async function claimPendingOnce(deps) {
  for (let attempt = 0; attempt < 25; attempt++) {
    const response = await chrome.runtime.sendMessage({ type: "claim-attachment" });
    if (response?.files?.length) {
      const input = await waitForComposerInput();
      if (!input) {
        deps.showToast("The new composer did not offer a file picker. Nothing was attached and nothing was posted.");
        return;
      }
      const result = applyAttachment(response.files);
      if (!result.count) {
        deps.showToast("The composer did not accept the file. Nothing was attached and nothing was posted.");
        return;
      }
      deps.showToast(`Attached ${result.names.join(", ")} for review. Nothing was posted.`);
      mark(`attached:${result.names.join(",")}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

async function waitForComposerInput() {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (pageHasDraft(document)) return null;
    const input = findEmptyComposerInput(document);
    if (input) return input;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

/** @param {Event} event */
function eventInMenu(event) {
  return typeof event.composedPath === "function" && event.composedPath().some((node) => node?.id === "x-native-extension-menu");
}

function actionsFor(target, post) {
  const options = imageOptions();
  return menuActionIds({
    targetKind: classifyMediaTarget(target, post, options),
    hasPhoto: collectPostImages(post, options).length > 0,
    hasVideo: postHasVideo(post),
  });
}

/** @param {string[]} actions */
function publishMenuActions(actions) {
  if (document.documentElement) document.documentElement.dataset.xneMenuActions = actions.join(",");
  chrome.runtime.sendMessage({ type: "sync-menus", actions }).catch(() => {});
}

function imageOptions() {
  try {
    return { allowLocal: manifestGrantsLocalFixtures(chrome.runtime.getManifest()) };
  } catch {
    return { allowLocal: false };
  }
}

function mark(value) {
  const root = document.documentElement;
  if (root) root.dataset.xneChoice = value.slice(0, 1500);
}
