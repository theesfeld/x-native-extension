import { resolveImage, resolveOpenableVideoUrl, resolveVideo } from "../lib/download-media.js";
import { UserVisibleError } from "../lib/errors.js";
import { assertDownloadFilename } from "../lib/filename.js";
import { assertMediaUrl, imageHostsForManifest, isAllowedPageUrl, manifestGrantsLocalFixtures, resolveComposerUrl } from "../lib/hosts.js";
import { encodeBase64, MENU_ITEMS, parseDownloadImage, parseDownloadPng, parseDownloadVideo } from "../lib/messages.js";
import { sniffBytes } from "../lib/sniff.js";

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
    /* the active tab is not a page this extension runs on */
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "The request failed. Nothing was saved.",
      });
    });
  return true;
});

/**
 * @param {unknown} message
 * @param {chrome.runtime.MessageSender} sender
 */
/** @type {Map<number, { files: { base64: string, mime: string, filename: string }[] }>} */
const pendingAttachments = new Map();
/** @type {{ files: { base64: string, mime: string, filename: string }[], created: number } | null} */
let nextAttachment = null;
const ATTACH_LIMIT = 32_000_000;

chrome.tabs.onRemoved.addListener((tabId) => pendingAttachments.delete(tabId));

/**
 * @param {unknown} message
 * @param {chrome.runtime.MessageSender} sender
 */
async function openMedia(message, sender) {
  assertContentSender(sender);
  const msg = /** @type {{ kind?: string, urls?: string[] }} */ (message);
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

/**
 * @param {unknown} message
 * @param {chrome.runtime.MessageSender} sender
 */
async function postMedia(message, sender) {
  assertContentSender(sender);
  const msg = /** @type {{ kind?: string, items?: { urls?: string[], filenameBase?: string }[], preferNewTab?: boolean, fixtureComposer?: string }} */ (message);
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
        "not-attachable",
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

/** @param {chrome.runtime.MessageSender} sender */
function claimAttachment(sender) {
  assertContentSender(sender);
  const pending = sender.tab?.id != null ? pendingAttachments.get(sender.tab.id) : undefined;
  if (pending) {
    pendingAttachments.delete(sender.tab.id);
    nextAttachment = null;
    return { ok: true, files: pending.files };
  }
  if (nextAttachment && Date.now() - nextAttachment.created < 20_000) {
    const files = nextAttachment.files;
    nextAttachment = null;
    return { ok: true, files };
  }
  return { ok: true, empty: true };
}

/**
 * @param {Uint8Array} bytes
 * @param {string} filename
 * @param {string} mime
 */
function fileRecord(bytes, filename, mime) {
  if (bytes.byteLength > ATTACH_LIMIT) {
    throw new UserVisibleError(
      "The file is too large to attach from this extension. Nothing was attached.",
      "too-large",
    );
  }
  return { base64: encodeBase64(bytes), mime, filename: assertDownloadFilename(filename) };
}

/**
 * @param {string} url
 * @param {string[]} hosts
 */
function assertMediaUrlSafe(url, hosts) {
  return assertMediaUrl(url, hosts).toString();
}

async function syncMenus(message, sender) {
  assertContentSender(sender);
  const requested = new Set(
    Array.isArray(/** @type {{ actions?: unknown }} */ (message).actions)
      ? /** @type {{ actions: unknown[] }} */ (message).actions.filter((id) => MENU_ITEMS.some((item) => item.id === id))
      : [],
  );
  await Promise.all(MENU_ITEMS.map((item) => chrome.contextMenus.update(item.id, { visible: requested.has(item.id) }).catch(() => {})));
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
      documentUrlPatterns: patterns,
    });
  }
}

/**
 * @param {unknown} message
 * @param {chrome.runtime.MessageSender} sender
 */
async function handleMessage(message, sender) {
  if (!message || typeof message !== "object") return { ok: false, error: "Bad message." };
  const type = /** @type {{ type?: string }} */ (message).type;
  if (type === "sync-menus") return syncMenus(message, sender);
  if (type === "open-media") return openMedia(message, sender);
  if (type === "post-media") return postMedia(message, sender);
  if (type === "claim-attachment") return claimAttachment(sender);
  if (type === "capture-viewport") return captureViewport(sender);
  if (type === "download-image" || type === "download-video" || type === "download-png") {
    assertContentSender(sender);
    if (type === "download-image") {
      const hosts = imageHostsForManifest(chrome.runtime.getManifest());
      const parsed = parseDownloadImage(message, hosts);
      const image = await resolveImage(parsed.urls, { hosts });
      const filename = assertDownloadFilename(`${parsed.filenameBase}.${image.ext}`);
      await saveBytes(image.bytes, filename, image.mime);
      return { ok: true, notice: image.notice, filename: `X-Native/${filename}` };
    }
    if (type === "download-video") {
      const parsed = parseDownloadVideo(message);
      const video = await resolveVideo(parsed.urls);
      const filename = assertDownloadFilename(`${parsed.filenameBase}.${video.ext}`);
      await saveBytes(video.bytes, filename, video.mime);
      return { ok: true, notice: video.notice, filename: `X-Native/${filename}` };
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
  return undefined;
}

/** @param {chrome.runtime.MessageSender} sender */
function assertContentSender(sender) {
  if (!sender.tab?.id || !sender.tab.url || !isAllowedPageUrl(sender.tab.url, chrome.runtime.getManifest())) {
    throw new UserVisibleError("Refused a download request from an unexpected page.", "bad-sender");
  }
}

/** @param {chrome.runtime.MessageSender} sender */
async function captureViewport(sender) {
  assertContentSender(sender);
  const dataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" });
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png")) {
    throw new UserVisibleError("The browser did not return a PNG screenshot.", "capture");
  }
  return { ok: true, dataUrl };
}

/**
 * @param {Uint8Array} bytes
 * @param {string} filename
 * @param {string} mime
 */
function saveBytes(bytes, filename, mime) {
  // This Chrome's extension service worker has no URL.createObjectURL.
  // downloads.download accepts a data URL. Those items can remain
  // "in_progress" after the file is already written, so completion is also
  // detected from a stable received size.
  if (bytes.byteLength > 32_000_000) {
    return Promise.reject(
      new UserVisibleError(
        "The file is too large to hand to the download manager from this browser. Nothing was saved.",
        "too-large",
      ),
    );
  }
  const url = `data:${mime};base64,${encodeBase64(bytes)}`;
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url,
        filename: `X-Native/${filename}`,
        saveAs: false,
        conflictAction: "uniquify",
      },
      (id) => {
        const failure = chrome.runtime.lastError;
        if (failure || id == null) {
          reject(new UserVisibleError(failure?.message || "The browser refused the download.", "download"));
          return;
        }
        let settled = false;
        let previousBytes = -1;
        /** @type {ReturnType<typeof setInterval> | undefined} */
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
        }, 15000);
      },
    );
  });
}
