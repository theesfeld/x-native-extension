/* Generated from src by scripts/build.mjs. Edit the source, then rebuild. */
(() => {
  // src/lib/context-menu-policy.js
  function contextMenuMode(input) {
    if (!input.hasPost) return "ignore";
    if (input.shiftKey) return "site";
    if (input.altKey) return "browser";
    return "extension";
  }
  function menuActionIds(input) {
    const kind = input.targetKind || "body";
    const ids = [];
    if (kind === "photo" || kind === "body" && input.hasPhoto) {
      ids.push("download-image", "open-image", "post-image");
    }
    if (kind === "video" || kind === "body" && input.hasVideo) {
      ids.push("download-video", "open-video", "post-video");
    }
    ids.push("screenshot-post");
    return ids;
  }
  function captureNeedsInvocation(message) {
    return /activeTab|<all_urls>|all_urls/i.test(String(message || ""));
  }

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

  // src/lib/filename.js
  function sanitizeFilename(name) {
    const cleaned = String(name).replace(/[\u0000-\u001f]/g, "").replace(/[\\/:*?"<>|]/g, "-").replace(/\.\.+/g, ".").replace(/^\.+/, "").replace(/\s+/g, "-").slice(0, 120);
    if (!cleaned || cleaned === ".") return "x-download";
    return cleaned;
  }
  function filenameBaseForStatus(statusId, kind, index = 0) {
    const id = typeof statusId === "string" && /^\d{5,22}$/.test(statusId) ? `status-${statusId}` : "post";
    const suffix = index > 0 ? `-${index}` : "";
    const base = sanitizeFilename(`x-${id}-${kind}${suffix}`).toLowerCase();
    if (!/^x-[a-z0-9-]+$/.test(base)) {
      throw new UserVisibleError("Could not build a safe filename.", "bad-filename");
    }
    return base;
  }

  // src/lib/hosts.js
  var IMAGE_HOSTS = ["pbs.twimg.com"];
  var VIDEO_HOSTS = ["video.twimg.com"];
  function manifestGrantsLocalFixtures(manifest) {
    const perms = manifest?.host_permissions || [];
    return perms.includes("http://127.0.0.1/*") || perms.includes("http://localhost/*");
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

  // src/lib/image-url.js
  var FORMATS = /* @__PURE__ */ new Set(["jpg", "jpeg", "png", "webp", "gif"]);
  function toOriginalImageUrl(src, options = {}) {
    const parsed = parseMediaUrl(src, options);
    if (!parsed) return null;
    const out = new URL(`${parsed.origin}/media/${parsed.id}`);
    out.searchParams.set("format", parsed.format === "jpeg" ? "jpg" : parsed.format);
    out.searchParams.set("name", "orig");
    return out.toString();
  }
  function imageCandidateUrls(src, options = {}) {
    const original = toOriginalImageUrl(src, options);
    if (!original) return [];
    const urls = [original];
    const large = withName(original, "large");
    if (large && !urls.includes(large)) urls.push(large);
    const hosts = options.allowLocal ? [...IMAGE_HOSTS, "127.0.0.1", "localhost"] : IMAGE_HOSTS;
    try {
      const raw = assertMediaUrl(src, hosts);
      if (raw.pathname.includes("/media/") && !urls.includes(raw.toString())) urls.push(raw.toString());
    } catch {
    }
    return urls;
  }
  function withName(src, name) {
    const url = new URL(src);
    url.searchParams.set("name", name);
    return url.toString();
  }
  function parseMediaUrl(src, options = {}) {
    let url;
    try {
      url = new URL(src);
    } catch {
      return null;
    }
    const local = options.allowLocal && url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
    const remote = url.protocol === "https:" && url.hostname === "pbs.twimg.com";
    if (!local && !remote) return null;
    if (url.username || url.password) return null;
    const match = url.pathname.match(
      /^\/media\/([A-Za-z0-9_-]+?)(?:\.(jpg|jpeg|png|webp|gif))?(?::[A-Za-z0-9]+)?$/i
    );
    if (!match) return null;
    let format = (url.searchParams.get("format") || match[2] || "jpg").toLowerCase();
    if (format === "jpeg") format = "jpg";
    if (!FORMATS.has(format)) return null;
    return { id: match[1], format, origin: url.origin };
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
  function parseContextAction(message) {
    if (!message || typeof message !== "object") return null;
    const msg = (
      /** @type {Record<string, unknown>} */
      message
    );
    if (msg.type !== "context-action") return null;
    if (typeof msg.action !== "string" || !MENU_IDS.has(msg.action)) return null;
    return { type: "context-action", action: msg.action };
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

  // src/lib/post-dom.js
  var POST_SELECTOR = [
    "article[data-testid='tweet']",
    "[data-testid='tweet']",
    "article[role='article']",
    "[data-testid='quoteTweet']",
    // Logged-out x.com in Nov 2026 renders posts as plain <article> elements,
    // with the status id on a parent [data-href]. Older test ids are still listed.
    "article"
  ].join(", ");
  var COMPOSER_SELECTOR = [
    "[data-testid='tweetTextarea_0']",
    "[data-testid^='tweetTextarea_']",
    "[data-testid='tweetTextarea']",
    "[data-testid='dmComposerTextInput']",
    "[data-testid='dmComposerTextInputRichText']"
  ].join(", ");
  var REJECT_SELECTOR = [
    "[data-testid='SearchBox_Search_Input']",
    "[role='search']",
    "input[type='password']",
    "input[type='email']",
    "input[type='file']",
    "input[type='hidden']"
  ].join(", ");
  var LABEL_RE = /(post text|tweet text|\breply\b|what.?s happening|add a comment|unsent post|unsent tweet)/i;
  function elementFromEvent(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    for (const node of path) {
      if (node && /** @type {Node} */
      node.nodeType === 1) return (
        /** @type {Element} */
        node
      );
    }
    const target = event.target;
    if (target && /** @type {Node} */
    target.nodeType === 1) return (
      /** @type {Element} */
      target
    );
    return null;
  }
  function findPostRoot(target) {
    if (!target || typeof target.closest !== "function") return null;
    return target.closest(POST_SELECTOR);
  }
  function findComposerEditable(node) {
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
    if (editable.closest(COMPOSER_SELECTOR)) return (
      /** @type {HTMLElement} */
      editable
    );
    const label = `${editable.getAttribute("aria-label") || ""} ${editable.getAttribute("aria-description") || ""}`;
    if (LABEL_RE.test(label) && !/search/i.test(label)) return (
      /** @type {HTMLElement} */
      editable
    );
    return null;
  }
  var VIDEO_PLAYER_SELECTOR = "video, [data-testid='videoPlayer'], [data-testid='videoComponent']";
  var VIDEO_THUMB_RE = /\/(amplify_video_thumb|ext_tw_video_thumb|tweet_video_thumb|amplify_video|ext_tw_video|tweet_video)\//;
  function isVideoThumbUrl(src) {
    return VIDEO_THUMB_RE.test(src || "");
  }
  function isVideoSurface(node, post) {
    if (!node || typeof node.closest !== "function" || !post) return false;
    const player = node.closest(VIDEO_PLAYER_SELECTOR);
    if (player && post.contains(player) && player.closest(POST_SELECTOR) === post) return true;
    const img = node.tagName === "IMG" ? node : node.closest("img");
    if (!img || img.closest(POST_SELECTOR) !== post) return false;
    return isVideoThumbUrl(imageSource(img));
  }
  function isPostPhoto(img, post, options = {}) {
    if (!img || img.tagName !== "IMG") return false;
    if (typeof img.closest !== "function" || img.closest(POST_SELECTOR) !== post) return false;
    if (isVideoSurface(img, post)) return false;
    const src = imageSource(img);
    if (src.includes("://pbs.twimg.com/media/")) return true;
    return Boolean(options.allowLocal && /^http:\/\/(127\.0\.0\.1|localhost)(?::\d+)?\/media\//.test(src));
  }
  function imageSource(img) {
    const image = (
      /** @type {HTMLImageElement} */
      img
    );
    return image.currentSrc || image.src || img.getAttribute("src") || "";
  }
  function findTargetedImage(target, post, options = {}) {
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
  function collectPostImages(post, options = {}) {
    return [...post.querySelectorAll("img")].filter((img) => isPostPhoto(img, post, options));
  }
  function postHasVideo(post) {
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
  function classifyMediaTarget(target, post, options = {}) {
    if (!target || !post) return "body";
    if (isVideoSurface(target, post)) return "video";
    if (findTargetedImage(target, post, options)) return "photo";
    return "body";
  }
  function findTargetVideo(target, post) {
    const direct = target && typeof target.closest === "function" ? target.closest("video, [data-testid='videoPlayer'], [data-testid='videoComponent']") : null;
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
  function statusHref(node) {
    if (!node || typeof node.getAttribute !== "function") return "";
    return node.getAttribute("href") || node.getAttribute("data-href") || "";
  }
  function findStatusId(post) {
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
  function directVideoUrls(video) {
    const urls = [];
    const current = (
      /** @type {HTMLVideoElement} */
      video.currentSrc || video.getAttribute("src") || ""
    );
    if (current.startsWith("https://")) urls.push(current);
    for (const source of video.querySelectorAll("source")) {
      const src = source.getAttribute("src") || "";
      if (src.startsWith("https://")) urls.push(src);
    }
    return urls;
  }
  function videoHints(video) {
    const hints = [];
    const poster = video.getAttribute("poster") || "";
    if (poster) hints.push(poster);
    const player = typeof video.closest === "function" && video.closest("[data-testid='videoPlayer'], [data-testid='videoComponent']") || video.parentElement;
    if (player) {
      for (const img of player.querySelectorAll("img")) {
        const src = imageSource(img);
        if (src) hints.push(src);
      }
    }
    return hints;
  }

  // src/lib/video-url.js
  var FILE_RE = /\.(mp4|webm|mov|m4s)(?:$|\?)/i;
  var PLAYLIST_RE = /\.m3u8(?:$|\?)/i;
  function mediaIds(value) {
    const ids = /* @__PURE__ */ new Set();
    for (const match of String(value || "").matchAll(/(?<!\d)(\d{12,22})(?!\d)/g)) ids.add(match[1]);
    return ids;
  }
  function classifyVideoUrl(url) {
    let parsed;
    try {
      parsed = assertMediaUrl(url, VIDEO_HOSTS);
    } catch {
      return null;
    }
    if (PLAYLIST_RE.test(parsed.pathname)) return "playlist";
    if (FILE_RE.test(parsed.pathname) || parsed.pathname.includes("/vid/")) return "file";
    return null;
  }
  function collectVideoUrls(input) {
    const hintIds = /* @__PURE__ */ new Set();
    for (const hint of input.hints || []) {
      for (const id of mediaIds(hint)) hintIds.add(id);
    }
    const out = [];
    const add = (url) => {
      if (!url || out.includes(url)) return;
      if (!classifyVideoUrl(url)) return;
      out.push(url);
    };
    const sharesHint = (url) => {
      if (hintIds.size === 0) return false;
      for (const id of mediaIds(url)) {
        if (hintIds.has(id)) return true;
      }
      return false;
    };
    for (const url of input.directUrls || []) add(url);
    for (const url of input.playbackUrls || []) {
      if (input.playbackExclusive || sharesHint(url) || hintIds.size === 0) add(url);
    }
    for (const url of input.observedUrls || []) {
      if (sharesHint(url)) add(url);
    }
    return out;
  }

  // src/content/composer.js
  var FILE_INPUT = "input[type='file']";
  function findFileInputs(doc) {
    return [...doc.querySelectorAll(FILE_INPUT)].filter((input) => {
      const accept = (input.getAttribute("accept") || "").toLowerCase();
      const testid = input.getAttribute("data-testid") || "";
      return testid === "fileInput" || accept.includes("image") || accept.includes("video") || accept === "";
    });
  }
  function composerShell(input) {
    return input.closest("[role='dialog'], form, [data-testid='toolBar']") || input.parentElement || input;
  }
  function shellHasDraft(shell) {
    if (!shell) return false;
    for (const node of shell.querySelectorAll("[contenteditable='true'], textarea")) {
      const value = node.innerText || node.textContent || node.value || "";
      if (value.trim()) return true;
    }
    for (const input of shell.querySelectorAll(FILE_INPUT)) {
      if (input.files?.length) return true;
    }
    return Boolean(shell.querySelector("[data-testid='attachments'], [data-testid='mediaPreview']"));
  }
  function pageHasDraft(doc) {
    return findFileInputs(doc).some((input) => shellHasDraft(composerShell(input)));
  }
  function findEmptyComposerInput(doc) {
    return findFileInputs(doc).find((input) => !shellHasDraft(composerShell(input))) || null;
  }
  function attachFiles(input, files) {
    const transfer = new DataTransfer();
    for (const file of files) transfer.items.add(file);
    input.files = transfer.files;
    const change = new Event("change", { bubbles: true });
    input.dispatchEvent(change);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return {
      count: input.files?.length || 0,
      names: [...input.files || []].map((file) => file.name),
      changeTrusted: change.isTrusted
    };
  }
  function isComposerPage(href) {
    try {
      const url = new URL(href);
      if (url.origin === "https://x.com" && url.pathname === "/compose/post") return true;
      if ((url.hostname === "127.0.0.1" || url.hostname === "localhost") && url.pathname === "/compose-fixture") return true;
    } catch {
      return false;
    }
    return false;
  }

  // src/content/page-menu.js
  function createPageMenu(deps) {
    const host = document.createElement("div");
    host.id = "x-native-extension-menu";
    host.style.cssText = "position:fixed;z-index:2147483647;top:0;left:0;display:none;";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
    <style>
      .card {
        width: min(280px, calc(100vw - 16px));
        background: #fffdf8;
        color: #1f2933;
        border: 1px solid #ddd4c4;
        border-radius: 12px;
        box-shadow: 0 12px 32px rgba(31, 41, 51, 0.2);
        padding: 8px;
        font: 14px/1.35 "Segoe UI", "Helvetica Neue", sans-serif;
      }
      .title { margin: 2px 6px 6px; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: #0f6e56; }
      button {
        display: block;
        width: 100%;
        text-align: left;
        border: 0;
        background: transparent;
        color: inherit;
        border-radius: 8px;
        padding: 8px 8px;
        cursor: pointer;
        font: inherit;
      }
      button:hover, button:focus { background: #e7f3ee; outline: none; }
      .note, .hint { margin: 6px 6px 2px; color: #3d4a45; font-size: 12px; }
    </style>
    <div class="card" role="menu" aria-label="X Native Extension">
      <div class="title">X Native Extension</div>
      <div class="actions"></div>
      <p class="note"></p>
      <p class="hint">Shift+right-click keeps X\u2019s menu. Alt+right-click opens the browser menu. Alt+Shift+S screenshots this post.</p>
    </div>
  `;
    const actions = shadow.querySelector(".actions");
    const note2 = shadow.querySelector(".note");
    for (const item of MENU_ITEMS) {
      const button = document.createElement("button");
      button.type = "button";
      button.role = "menuitem";
      button.dataset.action = item.id;
      button.textContent = item.title;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        deps.onAction(item.id);
      });
      actions.appendChild(button);
    }
    function ensure() {
      const parent = document.documentElement || document.body;
      if (parent && !host.isConnected) parent.appendChild(host);
    }
    function show(clientX, clientY, actionIds) {
      ensure();
      note2.textContent = "";
      const visible = new Set(actionIds || []);
      let any = false;
      for (const button of actions.querySelectorAll("button")) {
        const on = visible.has(button.dataset.action || "");
        button.hidden = !on;
        button.style.display = on ? "block" : "none";
        if (on) any = true;
      }
      if (!any) {
        host.style.display = "none";
        return;
      }
      host.style.display = "block";
      const width = host.offsetWidth || 280;
      const height = host.offsetHeight || 210;
      const maxX = Math.max(8, window.innerWidth - width - 8);
      const maxY = Math.max(8, window.innerHeight - height - 8);
      host.style.left = `${Math.min(Math.max(8, clientX), maxX)}px`;
      host.style.top = `${Math.min(Math.max(8, clientY), maxY)}px`;
    }
    function hide() {
      host.style.display = "none";
    }
    function setNote(message) {
      note2.textContent = message;
    }
    document.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || host.style.display === "none") return;
      if (event.composedPath().includes(host)) return;
      hide();
    }, true);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && host.style.display !== "none") hide();
    }, true);
    return { show, hide, setNote, host };
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

  // src/content/screenshot.js
  async function capturePostPng(post, deps) {
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
      rect = post.getBoundingClientRect();
      view.scrollTo(view.scrollX, view.scrollY + rect.top);
      await nextFrames();
      const totalHeight = post.getBoundingClientRect().height;
      const dpr = view.devicePixelRatio || 1;
      const maxCss = Math.floor(12e3 / dpr);
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
          scaleY: image.height / view.innerHeight
        });
        covered += sliceHeight;
        if (rect.bottom <= view.innerHeight + 0.5) break;
        const before = view.scrollY;
        if (before === previousScroll) break;
        previousScroll = before;
        view.scrollTo(view.scrollX, before + sliceHeight);
        await nextFrames();
        if (Math.abs(view.scrollY - before) < 0.5) {
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
        sh
      );
      destY += sh;
    }
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Could not encode the screenshot as PNG.");
    return new Uint8Array(await blob.arrayBuffer());
  }
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
  function hideOverlappingChrome(post, view) {
    const hidden = [];
    const nodes = document.body ? document.body.querySelectorAll("*") : [];
    let checked = 0;
    for (const node of nodes) {
      if (++checked > 2500) break;
      if (node.nodeType !== 1) continue;
      const element = (
        /** @type {HTMLElement} */
        node
      );
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

  // src/content/video-tracker.js
  var armed = /* @__PURE__ */ new Set();
  var buckets = /* @__PURE__ */ new WeakMap();
  var recent = [];
  function installVideoTracker() {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          note(entry.name);
        }
      });
      observer.observe({ type: "resource", buffered: true });
    } catch {
    }
    const arm = (event) => {
      const target = event.target;
      if (!target || /** @type {Element} */
      target.tagName !== "VIDEO") return;
      const video = (
        /** @type {Element} */
        target
      );
      const until = Date.now() + 8e3;
      armed.add({ video, until });
      const bucket = bucketFor(video);
      const now = Date.now();
      for (const item of recent) {
        if (now - item.at < 3e3) bucket.add(item.url);
      }
    };
    document.addEventListener("play", arm, true);
    document.addEventListener("loadeddata", arm, true);
    document.addEventListener("progress", arm, true);
  }
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
  function bucketFor(video) {
    let bucket = buckets.get(video);
    if (!bucket) {
      bucket = /* @__PURE__ */ new Set();
      buckets.set(video, bucket);
    }
    return bucket;
  }
  function playbackUrlsFor(video) {
    return [...buckets.get(video) || []];
  }
  function observedVideoUrls() {
    return recent.map((item) => item.url);
  }

  // src/content/actions.js
  var pageMenu = null;
  var CAPTURE_HINT = "Chrome blocked the screenshot. A button drawn on the page cannot grant it. Press Alt+Shift+S, or Alt+right-click and choose Screenshot post in the browser menu.";
  function installActions(deps) {
    let lastContext = null;
    pageMenu = createPageMenu({
      onAction(action) {
        const context = lastContext;
        pageMenu?.hide();
        run(action, context, deps).catch((error) => {
          deps.showToast(error instanceof Error ? error.message : "Something went wrong. Nothing was saved.");
        });
      }
    });
    const onPointer = (event) => {
      if (event.type !== "contextmenu" && event.button !== 2) return;
      const target = elementFromEvent(event);
      if (eventInMenu(event)) return;
      const post = target && !findComposerEditable(target) ? findPostRoot(target) : null;
      const mode = contextMenuMode({
        shiftKey: Boolean(event.shiftKey),
        altKey: Boolean(event.altKey),
        hasPost: Boolean(post)
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
  function requirePost(context) {
    if (!context || Date.now() - context.at > 15e3) {
      throw new UserVisibleError("Right-click the post again, then choose the menu item. The previous click expired.");
    }
    if (!context.post || context.post.isConnected === false) {
      throw new UserVisibleError("No post was under that click. Right-click the post or its media and try again.");
    }
    return context.post;
  }
  async function downloadImages(post, target, showToast) {
    const options = imageOptions();
    const targeted = target ? findTargetedImage(target, post, options) : null;
    const images = targeted ? [targeted] : collectPostImages(post, options);
    if (!images.length) {
      throw new UserVisibleError(
        "No post photo is under that click. Profile pictures, link cards, and video posters are left alone. Nothing was saved."
      );
    }
    const statusId = findStatusId(post);
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
  async function downloadVideo(post, target, showToast) {
    const found = findTargetVideo(target, post);
    if (!found.video) {
      if (found.reason === "many") {
        throw new UserVisibleError("Several videos are in this post. Right-click the video itself.");
      }
      if (postHasVideo(post)) {
        throw new UserVisibleError(
          "The full video file was not loaded by the page. The player is using a poster or a media buffer, which is not the whole file, so nothing was saved. Start playback, wait until the video is actually playing, then right-click the video and try again."
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
      playbackExclusive: videos.length <= 1
    });
    mark(urls.join(" "));
    if (!urls.length) {
      const src = found.video.getAttribute("src") || /** @type {HTMLVideoElement} */
      found.video.currentSrc || "";
      if (src.startsWith("blob:")) {
        throw new UserVisibleError(
          "The full video file was not loaded by the page. The player is using a blob or media-buffer address, which is not the whole file, so nothing was saved. Start playback, wait until the video is actually playing, then right-click the video and try again."
        );
      }
      throw new UserVisibleError(
        "The full video file was not loaded by the page. Start playback, wait until the video is actually playing, then right-click the video and try again. Nothing was saved."
      );
    }
    const filenameBase = filenameBaseForStatus(findStatusId(post), "video", 0);
    const response = await chrome.runtime.sendMessage({ type: "download-video", urls, filenameBase });
    if (!response?.ok) throw new UserVisibleError(response?.error || "Video download failed. Nothing was saved.");
    showToast(`${response.notice} ${response.filename}`);
  }
  async function screenshot(post, deps) {
    pageMenu?.hide();
    deps.showToast("Capturing the post\u2026");
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
      base64: encodeBase64(shot.png)
    });
    if (!response?.ok) throw new UserVisibleError(response?.error || "Could not save the screenshot.");
    let notice = "Saved a PNG of the post.";
    if (shot.truncated) notice = "Saved a PNG of the top of the post. The rest was too tall to capture in one image.";
    else if (shot.widthClipped) notice = "Saved a PNG of the visible width. The post is wider than the window.";
    deps.showToast(`${notice} ${response.filename}`);
    mark(`screenshot:${response.filename}`);
  }
  function chosenImages(post, target) {
    const options = imageOptions();
    const targeted = target ? findTargetedImage(target, post, options) : null;
    const images = targeted ? [targeted] : collectPostImages(post, options);
    return { images: images.slice(0, 4), extra: Math.max(0, images.length - 4), options };
  }
  async function openImages(post, target, showToast) {
    const chosen = chosenImages(post, target);
    if (!chosen.images.length) {
      throw new UserVisibleError("No post photo is under that click. Nothing was opened.");
    }
    const urls = chosen.images.map((img) => imageCandidateUrls(imageSource(img), chosen.options)[0]).filter(Boolean);
    const response = await chrome.runtime.sendMessage({ type: "open-media", kind: "image", urls });
    if (!response?.ok) throw new UserVisibleError(response?.error || "Nothing was opened.");
    const count = response.urls?.length || urls.length;
    const more = chosen.extra ? ` ${chosen.extra} more were left out because a post can show four images.` : "";
    showToast(count === 1 ? `Opened the full image in a new tab.${more}` : `Opened ${count} full images in new tabs.${more}`);
  }
  async function openVideo(post, target, showToast) {
    const urls = videoCandidateUrls(post, target);
    const response = await chrome.runtime.sendMessage({ type: "open-media", kind: "video", urls });
    if (!response?.ok) throw new UserVisibleError(response?.error || "Nothing was opened.");
    showToast("Opened the video file in a new tab.");
  }
  async function postImages(post, target, showToast) {
    const chosen = chosenImages(post, target);
    if (!chosen.images.length) throw new UserVisibleError("No post photo is under that click. Nothing was attached.");
    const statusId = findStatusId(post);
    const items = chosen.images.map((img, index) => ({
      urls: imageCandidateUrls(imageSource(img), chosen.options),
      filenameBase: filenameBaseForStatus(statusId, "image", chosen.images.length > 1 ? index + 1 : 0)
    }));
    await sendPost(post, "image", items, showToast, chosen.extra);
  }
  async function postVideo(post, target, showToast) {
    const urls = videoCandidateUrls(post, target);
    const items = [{ urls, filenameBase: filenameBaseForStatus(findStatusId(post), "video", 0) }];
    await sendPost(post, "video", items, showToast, 0);
  }
  async function sendPost(post, kind, items, showToast, extra) {
    const preferNewTab = pageHasDraft(document);
    const response = await chrome.runtime.sendMessage({
      type: "post-media",
      kind,
      items,
      preferNewTab,
      fixtureComposer: imageOptions().allowLocal ? `${location.origin}/compose-fixture` : ""
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
  function applyAttachment(records) {
    const input = findEmptyComposerInput(document);
    if (!input) throw new UserVisibleError("Couldn't find an empty composer file picker. Nothing was attached.");
    const files = records.map((record) => new File([decodeBase64(record.base64)], record.filename, { type: record.mime }));
    const result = attachFiles(input, files);
    if (document.documentElement) document.documentElement.dataset.xneChangeTrusted = result.changeTrusted ? "1" : "0";
    return result;
  }
  function videoCandidateUrls(post, target) {
    const found = findTargetVideo(target, post);
    if (!found.video) {
      if (postHasVideo(post)) {
        throw new UserVisibleError(
          "No full video address was loaded by the page. Start playback, then try again. Nothing was opened."
        );
      }
      throw new UserVisibleError("No video was found in the post you right-clicked. Nothing was opened.");
    }
    const urls = collectVideoUrls({
      hints: videoHints(found.video),
      directUrls: directVideoUrls(found.video),
      observedUrls: observedVideoUrls(),
      playbackUrls: playbackUrlsFor(found.video),
      playbackExclusive: true
    });
    if (!urls.length) {
      const src = found.video.getAttribute("src") || /** @type {HTMLVideoElement} */
      found.video.currentSrc || "";
      if (src.startsWith("blob:")) {
        throw new UserVisibleError(
          "This video is only a blob address in the page, which another tab cannot open and the composer cannot attach. Start playback so a file address loads, then try again. Nothing was opened."
        );
      }
      throw new UserVisibleError("No full video address was loaded by the page. Nothing was opened.");
    }
    return urls;
  }
  async function claimPending(deps) {
    try {
      await claimPendingOnce(deps);
    } catch (error) {
      deps.showToast(error instanceof Error ? error.message : "Nothing was attached.");
    }
  }
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
  function eventInMenu(event) {
    return typeof event.composedPath === "function" && event.composedPath().some((node) => node?.id === "x-native-extension-menu");
  }
  function actionsFor(target, post) {
    const options = imageOptions();
    return menuActionIds({
      targetKind: classifyMediaTarget(target, post, options),
      hasPhoto: collectPostImages(post, options).length > 0,
      hasVideo: postHasVideo(post)
    });
  }
  function publishMenuActions(actions) {
    if (document.documentElement) document.documentElement.dataset.xneMenuActions = actions.join(",");
    chrome.runtime.sendMessage({ type: "sync-menus", actions }).catch(() => {
    });
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

  // src/lib/settings.js
  var SETTINGS_DEFAULTS = {
    pasteAsTyped: true
  };
  var SESSION_KEY = "x-native-extension-paste";
  var MAX_PASTE_CHARS = 1e5;
  function readSessionPasteEnabled(storage) {
    if (!storage) return null;
    try {
      const value = storage.getItem(SESSION_KEY);
      if (value === "0") return false;
      if (value === "1") return true;
    } catch {
      return null;
    }
    return null;
  }
  function writeSessionPasteEnabled(storage, enabled) {
    if (!storage) return;
    try {
      storage.setItem(SESSION_KEY, enabled ? "1" : "0");
    } catch {
    }
  }

  // src/lib/paste-policy.js
  function decidePaste(input) {
    if (!input.composer) return { action: "ignore", reason: "not-composer" };
    if (!input.enabled) return { action: "ignore", reason: "disabled" };
    if (input.armed) {
      return {
        action: "allow-native",
        reason: "armed",
        consumeArm: true,
        toast: "This paste used the browser's normal paste."
      };
    }
    if (input.shiftHeld) return { action: "allow-native", reason: "shift" };
    if (input.hasFiles) return { action: "ignore", reason: "files" };
    const text = typeof input.plainText === "string" ? input.plainText : "";
    if (!text) return { action: "ignore", reason: "no-text" };
    if (text.length > MAX_PASTE_CHARS) {
      return {
        action: "allow-native",
        reason: "too-long",
        toast: "That paste is very long, so the browser's normal paste was used."
      };
    }
    return { action: "rewrite", reason: "plain-text", text };
  }

  // src/content/paste.js
  function installPaste(deps) {
    let enabled = readSessionPasteEnabled(sessionStorage()) ?? SETTINGS_DEFAULTS.pasteAsTyped;
    let armed2 = false;
    let shiftHeld = false;
    let handlingPaste = false;
    chrome.storage.local.get(SETTINGS_DEFAULTS).then((stored) => {
      enabled = stored.pasteAsTyped !== false;
      writeSessionPasteEnabled(sessionStorage(), enabled);
    }).catch(() => {
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.pasteAsTyped) return;
      enabled = changes.pasteAsTyped.newValue !== false;
      writeSessionPasteEnabled(sessionStorage(), enabled);
    });
    chrome.runtime.onMessage.addListener((message) => {
      if (!message || typeof message !== "object") return;
      if (message.type === "settings") {
        enabled = message.pasteAsTyped !== false;
        writeSessionPasteEnabled(sessionStorage(), enabled);
      } else if (message.type === "arm-native-paste") {
        armed2 = true;
        deps.showToast("The next paste in a composer will use the browser's normal paste.");
      }
    });
    window.addEventListener("keydown", (event) => {
      if (event.key === "Shift") shiftHeld = true;
    }, true);
    window.addEventListener("keyup", (event) => {
      if (event.key === "Shift") shiftHeld = false;
    }, true);
    window.addEventListener("blur", () => {
      shiftHeld = false;
    }, true);
    document.addEventListener("paste", (event) => {
      const decision = decidePaste({
        enabled,
        armed: armed2,
        shiftHeld,
        composer: Boolean(findComposerEditable(elementFromEvent(event))),
        plainText: readPlainText(event),
        hasFiles: clipboardHasFiles(event)
      });
      mark2(`paste:${decision.action}:${decision.reason}`);
      if (decision.consumeArm) armed2 = false;
      if (decision.toast) deps.showToast(decision.toast);
      if (decision.action !== "rewrite" || decision.text == null) return;
      const editable = findComposerEditable(elementFromEvent(event));
      if (!editable) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      handlingPaste = true;
      const result = insertAsTypedText(editable, decision.text);
      setTimeout(() => {
        handlingPaste = false;
      }, 0);
      if (!result.ok) {
        deps.showToast(
          "The browser refused the insert-text command, so nothing was inserted. Hold Shift and paste for a normal paste, or turn rewrite off."
        );
        mark2("paste:failed");
        return;
      }
      mark2(`rewrite:${decision.text.length}`);
    }, true);
    document.addEventListener("beforeinput", (event) => {
      if (handlingPaste) return;
      if (event.inputType !== "insertFromPaste" || !event.cancelable) return;
      const editable = findComposerEditable(elementFromEvent(event));
      if (!editable) return;
      const decision = decidePaste({
        enabled,
        armed: armed2,
        shiftHeld,
        composer: true,
        plainText: typeof event.data === "string" ? event.data : "",
        hasFiles: false
      });
      if (decision.action !== "rewrite" || !decision.text) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const result = insertAsTypedText(editable, decision.text);
      if (!result.ok) {
        deps.showToast(
          "The browser refused the insert-text command, so nothing was inserted. Hold Shift and paste for a normal paste, or turn rewrite off."
        );
      } else {
        mark2(`rewrite:${decision.text.length}`);
      }
    }, true);
  }
  function insertAsTypedText(editable, text) {
    const doc = editable.ownerDocument;
    const saved = saveSelection(editable);
    try {
      editable.focus({ preventScroll: true });
    } catch {
      editable.focus();
    }
    restoreSelection(editable, saved);
    const before = readEditable(editable);
    let ok = false;
    try {
      ok = doc.execCommand("insertText", false, text);
    } catch {
      ok = false;
    }
    const after = readEditable(editable);
    const changed = after !== before;
    return { ok: Boolean(ok) && (changed || text.length === 0), before, after };
  }
  function saveSelection(editable) {
    const tag = editable.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT") {
      const field = (
        /** @type {HTMLInputElement | HTMLTextAreaElement} */
        editable
      );
      return { kind: "input", start: field.selectionStart ?? field.value.length, end: field.selectionEnd ?? field.value.length };
    }
    const view = editable.ownerDocument.defaultView;
    const selection = view?.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!editable.contains(range.commonAncestorContainer)) return null;
    return { kind: "range", range: range.cloneRange() };
  }
  function restoreSelection(editable, saved) {
    if (!saved) return;
    if (saved.kind === "input") {
      const field = (
        /** @type {HTMLInputElement | HTMLTextAreaElement} */
        editable
      );
      try {
        field.setSelectionRange(saved.start, saved.end);
      } catch {
      }
      return;
    }
    const view = editable.ownerDocument.defaultView;
    const selection = view?.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(saved.range);
  }
  function readEditable(editable) {
    if (editable.tagName === "TEXTAREA" || editable.tagName === "INPUT") {
      return (
        /** @type {HTMLInputElement | HTMLTextAreaElement} */
        editable.value
      );
    }
    return editable.innerText ?? editable.textContent ?? "";
  }
  function readPlainText(event) {
    try {
      return event.clipboardData?.getData("text/plain") || "";
    } catch {
      return "";
    }
  }
  function clipboardHasFiles(event) {
    const data = event.clipboardData;
    if (!data) return false;
    const types = Array.from(data.types || []);
    if (types.includes("Files")) return true;
    return Array.from(data.items || []).some((item) => item.kind === "file");
  }
  function sessionStorage() {
    try {
      return globalThis.sessionStorage;
    } catch {
      return null;
    }
  }
  function mark2(status) {
    const root = document.documentElement;
    if (root) root.dataset.xneLast = status;
  }

  // src/content/toast.js
  function createToaster() {
    const host = document.createElement("div");
    host.id = "x-native-extension-toast";
    host.style.cssText = "position:fixed;z-index:2147483646;inset:auto 16px 16px auto;pointer-events:none;";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
    <style>
      .stack { display: flex; flex-direction: column; gap: 8px; align-items: flex-end; max-width: min(360px, calc(100vw - 32px)); }
      .toast {
        pointer-events: auto;
        background: #1f2933;
        color: #f4f0e6;
        border-radius: 10px;
        padding: 10px 12px;
        font: 13px/1.4 "Segoe UI", "Helvetica Neue", sans-serif;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
      }
    </style>
    <div class="stack"></div>
  `;
    const stack = shadow.querySelector(".stack");
    function ensure() {
      const parent = document.documentElement || document.body;
      if (parent && !host.isConnected) parent.appendChild(host);
    }
    function show(message) {
      if (!message || !stack) return;
      ensure();
      const el = document.createElement("div");
      el.className = "toast";
      el.setAttribute("role", "status");
      el.textContent = message;
      stack.appendChild(el);
      while (stack.children.length > 3) stack.firstChild?.remove();
      setTimeout(() => el.remove(), 8e3);
    }
    function setHidden(hidden) {
      host.style.display = hidden ? "none" : "";
    }
    return { show, setHidden };
  }

  // src/content/main.js
  if (!globalThis.__xneInstalled) {
    globalThis.__xneInstalled = true;
    if (document.documentElement) document.documentElement.dataset.xneReady = "1";
    const toaster = createToaster();
    installVideoTracker();
    installPaste({ showToast: toaster.show });
    installActions({ showToast: toaster.show, setToastHidden: toaster.setHidden });
  }
})();
