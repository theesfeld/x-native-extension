import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const root = path.resolve(import.meta.dirname, "../..");
const artifacts = process.env.XNE_ARTIFACTS || path.join(root, "artifacts");
const executablePath =
  process.env.CHROME_FOR_TESTING ||
  path.join(os.homedir(), ".cache/chrome-for-testing/chrome-linux64/chrome");

const composerHtml = `<!doctype html>
<meta charset="utf-8">
<title>composer fixture</title>
<style>
  body { margin: 24px; font-family: sans-serif; }
  #composer { min-height: 88px; border: 1px solid #999; white-space: pre-wrap; padding: 8px; }
  textarea, input { display: block; width: 320px; margin-top: 12px; }
</style>
<div id="composer" data-testid="tweetTextarea_0" contenteditable="true" role="textbox" aria-label="Post text"></div>
<textarea id="reply" aria-label="Reply"></textarea>
<div role="search"><input id="search" data-testid="SearchBox_Search_Input" /></div>
<script>
const log = [];
function watch(el) {
  for (const type of ["paste", "beforeinput", "input"]) {
    el.addEventListener(type, (event) => {
      log.push({
        target: el.id,
        type: event.type,
        trusted: event.isTrusted,
        inputType: event.inputType || null,
        data: event.data == null ? null : String(event.data),
        shiftOnEvent: "shiftKey" in event ? event.shiftKey : "absent"
      });
    });
  }
}
const composer = document.getElementById("composer");
watch(composer);
watch(document.getElementById("reply"));
watch(document.getElementById("search"));
composer.addEventListener("input", () => {
  composer.dataset.model = composer.innerText;
});
window.__events = log;
</script>`;

const tallHtml = `<!doctype html>
<meta charset="utf-8">
<title>tall post</title>
<style>
  html, body { margin: 0; }
  header { position: fixed; top: 0; left: 0; right: 0; height: 48px; background: #111; color: white; z-index: 5; }
  article { width: 480px; height: 1800px; margin: 80px; background: linear-gradient(#c4482d, #2457c5); }
</style>
<header>sticky chrome</header>
<article id="post" data-testid="tweet">
  <a href="/sam/status/5555555555555555555">time</a>
  <p>Top of a tall post.</p>
</article>`;

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(pass ? "PASS" : "FAIL", name, typeof detail === "string" ? detail : "");
}

async function check(name, fn) {
  try {
    record(name, true, await fn());
  } catch (error) {
    record(name, false, error.stack || String(error));
  }
}

function norm(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/\r\n/g, "\n").replace(/\n$/, "");
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xne-"));
const extDir = path.join(tmp, "ext");
fs.cpSync(path.join(root, "extension"), extDir, { recursive: true });
const manifestPath = path.join(extDir, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.content_scripts[0].matches.push("http://127.0.0.1/*");
manifest.host_permissions.push("http://127.0.0.1/*");
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const contentBundle = fs.readFileSync(path.join(extDir, "content.js"), "utf8");
if (/\beval\s*\(/.test(contentBundle) || /new Function\s*\(/.test(contentBundle)) {
  throw new Error("content bundle contains eval");
}

const suppressedHtml = `<!doctype html>
<meta charset="utf-8">
<title>suppressed menu</title>
<style>
  body { margin: 24px; background: #e7e1d6; font-family: sans-serif; }
  article { width: 520px; background: white; padding: 12px; }
  img { width: 480px; height: 180px; display: block; background: #8a6a45; }
  #quote { margin-top: 12px; border: 1px solid #ccc; padding: 8px; }
  #xmenu { display: none; position: fixed; z-index: 5; background: #111; color: white; border-radius: 16px; padding: 8px; }
  #xmenu button { display: block; width: 100%; background: transparent; color: white; border: 0; text-align: left; padding: 10px 14px; font-size: 16px; }
  #nav { display: inline-block; margin-bottom: 12px; }
</style>
<a id="nav" href="/landed">Open profile</a>
<article id="outer" data-testid="tweet">
  <a href="/alice/status/1111111111111111111">outer time</a>
  <img id="outer-img" alt="outer photo" src="/media/OUTER?format=jpg&amp;name=small">
  <div id="quote" data-testid="quoteTweet">
    <a href="/bob/status/2222222222222222222">quoted time</a>
    <img id="quote-img" alt="quote photo" src="/media/QUOTE?format=jpg&amp;name=small">
  </div>
</article>
<div id="xmenu" role="menu">
  <button type="button">Copy photo link</button>
  <button type="button">Post Photo</button>
</div>
<script>
  const menu = document.getElementById("xmenu");
  document.addEventListener("contextmenu", (event) => {
    document.documentElement.dataset.pageSaw = "1";
    event.preventDefault();
    menu.style.display = "block";
    menu.style.left = event.clientX + "px";
    menu.style.top = event.clientY + "px";
  });
</script>`;

const composerScript = `<script>
  document.addEventListener("change", (event) => {
    const input = event.target;
    if (!input || input.type !== "file") return;
    const names = [...input.files].map((file) => file.name + ":" + file.size + ":" + file.type);
    document.documentElement.dataset.attached = names.join(",");
    document.documentElement.dataset.changeTrusted = event.isTrusted ? "1" : "0";
  }, true);
  document.addEventListener("click", (event) => {
    if (event.target && event.target.id === "submit") document.documentElement.dataset.submitted = "1";
  }, true);
</script>`;
const composerBox = (text) => `<form id="composer">
  <div data-testid="tweetTextarea_0" contenteditable="true">${text}</div>
  <input id="file" type="file" data-testid="fileInput" accept="image/jpeg,image/png,video/mp4,video/webm">
  <button id="submit" type="button">Post</button>
</form>`;
const postPage = (text) => `<!doctype html><meta charset="utf-8"><title>post fixture</title>
${composerScript}
<article id="shot"><a href="/alice/status/1111111111111111111">time</a>
<img id="photo" src="/media/PHOTO?format=jpg&amp;name=small" alt="" width="320" height="120"></article>
${composerBox(text)}`;

const kindsHtml = `<!doctype html>
<meta charset="utf-8">
<title>media kinds</title>
<style>
  body { margin: 16px; background: #eee; font-family: sans-serif; }
  article { width: 420px; background: white; margin: 0 0 28px; padding: 8px; overflow: hidden; }
  img.photo, .player, video { width: 400px; height: 80px; background: #876; display: block; }
  .player { position: relative; }
  .player img, .player video { width: 100%; height: 100%; }
  #play { position: absolute; left: 16px; top: 16px; }
</style>
<article id="photo-post"><img id="photo" class="photo" src="/media/PHOTO?format=jpg&amp;name=small" alt="post photo"></article>
<article id="video-post">
  <div id="player" class="player" data-testid="videoPlayer">
    <img id="poster" src="https://pbs.twimg.com/amplify_video_thumb/99/img/abc.jpg" alt="">
    <button id="play" type="button">Play</button>
    <video id="video" src="blob:https://x.com/lazy"></video>
  </div>
</article>
<article id="text-post"><p id="words">just words</p><img id="avatar" src="https://pbs.twimg.com/profile_images/9/a_normal.jpg" alt=""></article>
<article id="mixed">
  <p id="mixed-text">caption</p>
  <img id="mixed-photo" class="photo" src="https://pbs.twimg.com/media/MIXED?format=jpg&amp;name=small" alt="">
  <div data-testid="videoPlayer"><video id="mixed-video" src="blob:https://x.com/m"></video></div>
  <div data-testid="quoteTweet"><img id="quote-only" src="https://pbs.twimg.com/media/QONLY?format=jpg&amp;name=small" alt=""></div>
</article>
<article id="outer-text">
  <p id="outer-words">outer caption</p>
  <div data-testid="quoteTweet"><img id="quoted-photo" class="photo" src="https://pbs.twimg.com/media/QPHOTO?format=jpg&amp;name=small" alt=""></div>
</article>`;

const timeline = fs.readFileSync(path.join(root, "tests/fixtures/timeline.html"));
const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (url.pathname.startsWith("/media/")) {
    const id = url.pathname.split("/").pop();
    const name = url.searchParams.get("name") || "";
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, name === "orig" ? 0x11 : 0x22, id === "QUOTE" ? 0x51 : 0x4f]);
    res.writeHead(200, { "content-type": "image/jpeg", "cache-control": "no-store" });
    res.end(bytes);
    return;
  }
  const body = url.pathname === "/timeline"
    ? timeline
    : url.pathname === "/tall"
      ? Buffer.from(tallHtml)
      : url.pathname === "/suppressed"
        ? Buffer.from(suppressedHtml)
        : url.pathname === "/kinds"
          ? Buffer.from(kindsHtml)
          : url.pathname === "/post-fixture"
            ? Buffer.from(postPage(""))
            : url.pathname === "/post-draft"
              ? Buffer.from(postPage("draft in progress"))
              : url.pathname === "/compose-fixture"
                ? Buffer.from(postPage(""))
                : url.pathname === "/landed"
          ? Buffer.from("<!doctype html><title>landed</title><p>Landed on the profile.</p>")
          : Buffer.from(composerHtml);
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const origin = `http://127.0.0.1:${port}`;

const browser = await puppeteer.launch({
  executablePath,
  headless: false,
  protocolTimeout: 30000,
  userDataDir: path.join(tmp, "profile"),
  args: [
    `--disable-extensions-except=${extDir}`,
    `--load-extension=${extDir}`,
    "--no-first-run",
    "--disable-gpu",
    "--window-size=1000,800",
  ],
});

try {
  const workerTarget = await browser.waitForTarget((target) => target.type() === "service_worker", { timeout: 15000 });
  const worker = await workerTarget.worker();
  const manifestInfo = await worker.evaluate(() => {
    const m = chrome.runtime.getManifest();
    return { name: m.name, permissions: m.permissions, hosts: m.host_permissions };
  });
  await check("extension service worker loaded", async () => {
    if (manifestInfo.name !== "X Native Extension") throw new Error(JSON.stringify(manifestInfo));
    return manifestInfo;
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 700, deviceScaleFactor: 1 });
  const client = await page.createCDPSession();
  await client.send("Browser.grantPermissions", {
    origin,
    permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
  });

  async function release() {
    for (const key of ["Shift", "Control", "Alt"]) await page.keyboard.up(key).catch(() => {});
  }
  async function setClipboard(text) {
    await page.evaluate(async (value) => navigator.clipboard.writeText(value), text);
  }
  async function pasteChord(withShift) {
    await release();
    if (withShift) await page.keyboard.down("Shift");
    await page.keyboard.down("Control");
    await page.keyboard.press("KeyV");
    await page.keyboard.up("Control");
    if (withShift) await page.keyboard.up("Shift");
  }
  async function readComposer() {
    return page.evaluate(() => ({
      text: document.getElementById("composer").innerText,
      model: document.getElementById("composer").dataset.model || "",
      last: document.documentElement.dataset.xneLast || "",
      events: window.__events.slice(),
      shiftPresent: "shiftKey" in new ClipboardEvent("paste"),
    }));
  }
  async function resetComposer(text) {
    await page.evaluate((value) => {
      const el = document.getElementById("composer");
      el.textContent = value;
      el.dataset.model = "";
      window.__events.length = 0;
      delete document.documentElement.dataset.xneLast;
    }, text);
  }

  await page.goto(`${origin}/composer`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-xne-ready]");
  fs.mkdirSync(artifacts, { recursive: true });

  await check("ctrl+v is insertText, not a paste, and keeps newline and emoji", async () => {
    const sample = "Café 🎉 line\nsecond 👨‍👩‍👧";
    await setClipboard(sample);
    await resetComposer("");
    await page.focus("#composer");
    await pasteChord(false);
    await page.waitForFunction(() => (document.documentElement.dataset.xneLast || "").startsWith("rewrite:"));
    const state = await readComposer();
    const text = norm(state.text);
    if (state.events.some((event) => event.type === "paste" || event.inputType === "insertFromPaste")) {
      throw new Error(`page saw a paste: ${JSON.stringify(state.events)}`);
    }
    if (!state.events.length || state.events.some((event) => !event.trusted || event.inputType !== "insertText")) {
      throw new Error(`unexpected input events: ${JSON.stringify(state.events)}`);
    }
    if (text !== sample) throw new Error(`text ${JSON.stringify(text)}`);
    if (norm(state.model) !== sample) throw new Error(`model ${JSON.stringify(state.model)}`);
    if (state.events.some((event) => event.type === "beforeinput")) {
      throw new Error(`beforeinput was emitted: ${JSON.stringify(state.events)}`);
    }
    await page.screenshot({ path: path.join(artifacts, "paste-fixture.png") });
    return { text, events: state.events, shiftKeyOnClipboardEvent: state.shiftPresent };
  });

  await check("selection is replaced and the rest of the text stays", async () => {
    await setClipboard("XY");
    await page.focus("#composer");
    await page.evaluate(() => {
      const editor = document.getElementById("composer");
      editor.textContent = "abcdef";
      const range = document.createRange();
      range.setStart(editor.firstChild, 2);
      range.setEnd(editor.firstChild, 4);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      window.__events.length = 0;
    });
    await pasteChord(false);
    const state = await readComposer();
    if (norm(state.text) !== "abXYef") throw new Error(JSON.stringify(state.text));
    return norm(state.text);
  });

  await check("one undo removes the rewritten paste", async () => {
    await setClipboard("XY");
    await resetComposer("BASE");
    await page.focus("#composer");
    await pasteChord(false);
    await page.evaluate(() => document.execCommand("undo"));
    const state = await readComposer();
    const undo = state.events.filter((event) => event.inputType === "historyUndo");
    if (norm(state.text) !== "BASE") throw new Error(`after undo ${JSON.stringify(state.text)} events ${JSON.stringify(state.events)}`);
    if (!undo.length || undo.some((event) => !event.trusted)) throw new Error(JSON.stringify(state.events));
    return { text: norm(state.text), undo: undo[0] };
  });

  await check("reply textarea is rewritten and search is not", async () => {
    await setClipboard("Zed");
    await page.evaluate(() => {
      document.getElementById("reply").value = "";
      document.getElementById("search").value = "";
      window.__events.length = 0;
    });
    await page.focus("#reply");
    await pasteChord(false);
    await page.focus("#search");
    await pasteChord(false);
    const state = await page.evaluate(() => ({
      reply: document.getElementById("reply").value,
      search: document.getElementById("search").value,
      events: window.__events.slice(),
      last: document.documentElement.dataset.xneLast || "",
    }));
    if (state.reply !== "Zed") throw new Error(`reply ${JSON.stringify(state)}`);
    if (!state.search.includes("Zed")) throw new Error(`search did not receive a native paste ${JSON.stringify(state)}`);
    const searchPaste = state.events.filter((event) => event.target === "search" && event.type === "paste");
    if (!searchPaste.length) throw new Error(JSON.stringify(state.events));
    const replyPaste = state.events.filter((event) => event.target === "reply" && event.type === "paste");
    if (replyPaste.length) throw new Error(`reply saw paste ${JSON.stringify(state.events)}`);
    return { reply: state.reply, search: state.search };
  });

  await check("shift paste stays native", async () => {
    await setClipboard("NATIVE");
    await resetComposer("START");
    await page.focus("#composer");
    await pasteChord(true);
    const state = await readComposer();
    const paste = state.events.filter((event) => event.type === "paste");
    if (!paste.length) throw new Error(`shift did not reach the page: ${JSON.stringify(state)}`);
    if (!norm(state.text).includes("NATIVE")) throw new Error(JSON.stringify(state.text));
    if (state.last !== "paste:allow-native:shift") throw new Error(state.last);
    return { last: state.last, inputTypes: state.events.map((event) => event.inputType) };
  });

  await check("armed paste is native once, then rewrite resumes", async () => {
    const tabId = await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab.id;
    });
    await worker.evaluate(async (id) => {
      await chrome.tabs.sendMessage(id, { type: "arm-native-paste" });
    }, tabId);
    await setClipboard("ARMED");
    await resetComposer("");
    await page.focus("#composer");
    await pasteChord(false);
    const first = await readComposer();
    if (!first.events.some((event) => event.type === "paste")) throw new Error(JSON.stringify(first));
    await setClipboard("AGAIN");
    await resetComposer("");
    await page.focus("#composer");
    await pasteChord(false);
    const second = await readComposer();
    if (second.events.some((event) => event.type === "paste")) throw new Error(JSON.stringify(second.events));
    if (norm(second.text) !== "AGAIN") throw new Error(JSON.stringify(second.text));
    return { first: first.last, second: second.last };
  });

  await check("turning the setting off restores normal paste", async () => {
    await worker.evaluate(() => chrome.storage.local.set({ pasteAsTyped: false }));
    await page.waitForFunction(() => sessionStorage.getItem("x-native-extension-paste") === "0");
    await setClipboard("OFF");
    await resetComposer("");
    await page.focus("#composer");
    await pasteChord(false);
    const state = await readComposer();
    if (!state.events.some((event) => event.type === "paste" && event.inputType == null)) {
      throw new Error(JSON.stringify(state));
    }
    if (!norm(state.text).includes("OFF")) throw new Error(JSON.stringify(state.text));
    await worker.evaluate(() => chrome.storage.local.set({ pasteAsTyped: true }));
    await page.waitForFunction(() => sessionStorage.getItem("x-native-extension-paste") === "1");
    return state.last;
  });

  async function clearToast() {
    await page.evaluate(() => {
      document.getElementById("x-native-extension-toast")?.shadowRoot?.querySelector(".stack")?.replaceChildren();
      delete document.documentElement.dataset.xneChoice;
    });
  }
  async function activate(selector) {
    await clearToast();
    await page.evaluate((sel) => {
      document.querySelector(sel).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, composed: true }));
    }, selector);
  }
  async function runAction(action) {
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id);
    await worker.evaluate(async (id, name) => {
      await chrome.tabs.sendMessage(id, { type: "context-action", action: name });
    }, tabId, action);
  }
  async function waitToast(pattern) {
    await page.waitForFunction((source) => {
      const text = document.getElementById("x-native-extension-toast")?.shadowRoot?.querySelector(".stack")?.textContent || "";
      return new RegExp(source, "i").test(text);
    }, { timeout: 20000 }, pattern);
    return page.evaluate(() =>
      document.getElementById("x-native-extension-toast").shadowRoot.querySelector(".stack").textContent.replace(/\s+/g, " ").trim(),
    );
  }

  await page.goto(`${origin}/timeline`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-xne-ready]");

  await check("quote image is the quote's original, not the outer photos", async () => {
    await activate("#quote-img");
    await runAction("download-image");
    const toast = await waitToast("nothing was saved|saved the original|saved the largest|could not download");
    const choice = await page.evaluate(() => document.documentElement.dataset.xneChoice || "");
    if (!choice.includes("https://pbs.twimg.com/media/QUOTE?format=jpg&name=orig")) throw new Error(choice);
    if (choice.includes("OUTERA") || choice.includes("OUTERB")) throw new Error(choice);
    if (/saved the original image/i.test(toast) && !toast.includes("QUOTE")) {
      throw new Error(toast);
    }
    return { choice, toast };
  });

  await check("clicking the outer post lists its photos and not the quote", async () => {
    await activate("#outer a");
    await runAction("download-image");
    const toast = await waitToast("nothing was saved|saved the original|saved the largest|could not download");
    const choice = await page.evaluate(() => document.documentElement.dataset.xneChoice || "");
    if (!choice.includes("OUTERA") || !choice.includes("OUTERB")) throw new Error(choice);
    if (choice.includes("QUOTE") || choice.includes("profile_images")) throw new Error(choice);
    return { choice, toast };
  });

  await check("a targeted photo does not download the rest of the post", async () => {
    await activate("#outer-a");
    await runAction("download-image");
    await waitToast("nothing was saved|saved the original|saved the largest|could not download");
    const choice = await page.evaluate(() => document.documentElement.dataset.xneChoice || "");
    if (!choice.includes("OUTERA") || choice.includes("OUTERB") || choice.includes("QUOTE")) throw new Error(choice);
    return choice;
  });

  await check("blob playback is refused instead of saving a fragment", async () => {
    const before = await worker.evaluate(() => chrome.downloads.search({ limit: 20 }));
    await activate("#blob-video");
    await runAction("download-video");
    const toast = await waitToast("blob|media-buffer");
    if (!/nothing was saved/i.test(toast)) throw new Error(toast);
    const after = await worker.evaluate(() => chrome.downloads.search({ limit: 20 }));
    if (after.length !== before.length) throw new Error(`download count ${before.length} -> ${after.length}`);
    return toast;
  });

  await check("several videos ask for a specific target", async () => {
    await activate("#many-text");
    await runAction("download-video");
    const toast = await waitToast("several videos");
    return toast;
  });

  await check("a real video element url is requested and a non-video body is not saved", async () => {
    const before = await worker.evaluate(() => chrome.downloads.search({ state: "complete", limit: 20 }));
    await activate("#direct-video");
    await runAction("download-video");
    const toast = await waitToast("nothing was saved|saved the video|encrypted|web page");
    const choice = await page.evaluate(() => document.documentElement.dataset.xneChoice || "");
    if (!choice.includes("https://video.twimg.com/ext_tw_video/1700000000000000001/pu/vid/1280x720/clip.mp4")) {
      throw new Error(choice);
    }
    if (/saved the video/i.test(toast)) throw new Error(`unexpected success toast: ${toast}`);
    if (!/nothing was saved/i.test(toast)) throw new Error(toast);
    const after = await worker.evaluate(() => chrome.downloads.search({ state: "complete", limit: 20 }));
    if (after.length !== before.length) throw new Error("a file was saved for a non-video response");
    return { choice, toast };
  });

  await page.goto(`${origin}/tall`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-xne-ready]");
  await check("screenshot stitches a tall post into one png", async () => {
    // Chrome 157 grants activeTab on extension invocation. The native menu could not be
    // driven here; the registered Alt+Shift+V command is the same kind of invocation.
    const session = await page.createCDPSession();
    await page.bringToFront();
    await page.click("#post");
    await session.send("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      modifiers: 9,
      key: "V",
      code: "KeyV",
      windowsVirtualKeyCode: 86,
      nativeVirtualKeyCode: 86,
    });
    await session.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      modifiers: 9,
      key: "V",
      code: "KeyV",
      windowsVirtualKeyCode: 86,
      nativeVirtualKeyCode: 86,
    });
    await page.waitForFunction(() =>
      (document.getElementById("x-native-extension-toast")?.shadowRoot?.querySelector(".stack")?.textContent || "").includes("normal paste"),
    );
    await activate("#post");
    await runAction("screenshot-post");
    const toast = await waitToast("saved a png|could not|refused|not a png|empty|failed|interrupted|did not|no visible|outside the window");
    const item = await worker.evaluate(async () => {
      const items = await chrome.downloads.search({ state: "complete", orderBy: ["-startTime"], limit: 5 });
      return items.find((entry) => entry.filename.endsWith(".png")) || null;
    });
    if (!item?.filename) throw new Error(`no png download. toast=${toast}`);
    const bytes = fs.readFileSync(item.filename);
    if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("not a png");
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    const dpr = await page.evaluate(() => window.devicePixelRatio || 1);
    const expectedWidth = 480 * dpr;
    const expectedHeight = 1800 * dpr;
    if (Math.abs(width - expectedWidth) > expectedWidth * 0.08) throw new Error(`width ${width} dpr ${dpr}`);
    if (height < expectedHeight * 0.9 || height > expectedHeight * 1.08) {
      throw new Error(`height ${height} expected about ${expectedHeight} dpr ${dpr}`);
    }
    fs.copyFileSync(item.filename, path.join(artifacts, "post-screenshot.png"));
    return { toast, width, height, filename: item.filename };
  });

  async function rightClick(selector, modifier) {
    const handle = await page.$(selector);
    const box = await handle?.boundingBox();
    if (!box) throw new Error(`missing ${selector}`);
    if (modifier) await page.keyboard.down(modifier);
    await page.mouse.click(box.x + Math.min(24, box.width / 2), box.y + Math.min(24, box.height / 2), { button: "right" });
    if (modifier) await page.keyboard.up(modifier);
  }
  async function menuLabels() {
    return page.evaluate(() => {
      const host = document.getElementById("x-native-extension-menu");
      if (!host || host.style.display === "none") return [];
      return [...host.shadowRoot.querySelectorAll("button")]
        .filter((button) => !button.hidden && button.style.display !== "none")
        .map((button) => button.textContent);
    });
  }
  async function waitForPage(predicate, read, target = page) {
    const started = Date.now();
    let last = "";
    while (Date.now() - started < 8000) {
      last = await target.evaluate(read);
      if (predicate(last)) return last;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    const toast = await target.evaluate(() => document.getElementById("x-native-extension-toast")?.shadowRoot?.textContent || "").catch(() => "");
    throw new Error(`timed out waiting for the page. last=${last} toast=${toast}`);
  }
  async function clickMenu(label) {
    // Click in the page world. ElementHandle.click adopts the node into the
    // extension isolated world, and that adoption stalls after a media tab
    // has been opened.
    const box = await page.evaluate((wanted) => {
      const host = document.getElementById("x-native-extension-menu");
      const button = [...(host?.shadowRoot?.querySelectorAll("button") || [])].find((item) => item.textContent === wanted);
      if (!button) return null;
      const rect = button.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: rect.width, height: rect.height };
    }, label);
    if (!box || box.width < 2 || box.height < 2) throw new Error(`menu button missing: ${label}`);
    await page.mouse.click(box.x, box.y);
  }
  async function newestDownload(part = "") {
    const started = Date.now();
    let last = null;
    while (Date.now() - started < 2000) {
      last = await worker.evaluate(async (needle) => {
        const items = await chrome.downloads.search({ orderBy: ["-startTime"], limit: 12 });
        return items.find((item) => item.filename && (!needle || item.filename.includes(needle))) || null;
      }, part);
      if (last?.filename && fs.existsSync(last.filename)) return last;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`download not found for ${part || "latest"}: ${JSON.stringify(last)}`);
  }

  await page.goto(`${origin}/suppressed`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-xne-ready]");
  await check("real right-click shows our actions and not X's menu", async () => {
    await page.evaluate(() => {
      delete document.documentElement.dataset.pageSaw;
      document.getElementById("xmenu").style.display = "none";
    });
    await rightClick("#outer-img");
    const state = await page.evaluate(() => ({
      trusted: document.documentElement.dataset.xneClickTrusted || "",
      mode: document.documentElement.dataset.xneMenuMode || "",
      pageSaw: document.documentElement.dataset.pageSaw || "",
      siteMenu: document.getElementById("xmenu").style.display,
    }));
    const labels = await menuLabels();
    if (state.trusted !== "1") throw new Error(`untrusted right-click ${JSON.stringify(state)}`);
    if (state.mode !== "extension") throw new Error(JSON.stringify(state));
    if (state.pageSaw || state.siteMenu === "block") throw new Error(`site menu still won ${JSON.stringify(state)}`);
    for (const label of ["Download full image from post", "Open image in new tab", "Post image", "Screenshot post"]) {
      if (!labels.includes(label)) throw new Error(labels.join(" | "));
    }
    if (labels.some((label) => label.includes("video"))) throw new Error(`photo also offered video: ${labels.join(" | ")}`);
    await page.screenshot({ path: path.join(artifacts, "repaired-menu.png") });
    return { labels, state };
  });

  await check("on-page download saves the original outer photo, not the quote", async () => {
    await clickMenu("Download full image from post");
    const toast = await waitToast("saved the original|nothing was saved|could not");
    const choice = await page.evaluate(() => document.documentElement.dataset.xneChoice || "");
    if (!/saved the original/i.test(toast)) throw new Error(`toast=${toast} choice=${choice}`);
    if (!choice.includes("/media/OUTER") || !choice.includes("name=orig")) throw new Error(`choice=${choice} toast=${toast}`);
    if (choice.includes("/media/QUOTE")) throw new Error(choice);
    const item = await newestDownload("1111111111111111111");
    if (!item.filename.endsWith(".jpg")) throw new Error(`${item.filename} toast=${toast}`);
    const bytes = fs.readFileSync(item.filename);
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[6] !== 0x11 || bytes[7] !== 0x4f) {
      throw new Error(`bytes ${[...bytes].join(",")} file ${item.filename}`);
    }
    if (!item.filename.includes("1111111111111111111")) throw new Error(item.filename);
    return { toast, filename: item.filename };
  });

  await check("right-click on the quote photo downloads that photo", async () => {
    await rightClick("#quote-img");
    const labels = await menuLabels();
    if (!labels.includes("Download full image from post")) throw new Error(labels.join(" | "));
    await clickMenu("Download full image from post");
    const toast = await waitToast("saved the original|nothing was saved");
    const choice = await page.evaluate(() => document.documentElement.dataset.xneChoice || "");
    if (!choice.includes("/media/QUOTE") || choice.includes("/media/OUTER")) throw new Error(choice);
    const item = await newestDownload("2222222222222222222");
    if (!item.filename.endsWith(".jpg")) throw new Error(item.filename);
    const bytes = fs.readFileSync(item.filename);
    if (bytes[6] !== 0x11 || bytes[7] !== 0x51) throw new Error([...bytes].join(","));
    if (!item.filename.includes("2222222222222222222")) throw new Error(item.filename);
    return { toast, filename: item.filename };
  });

  await check("shift right-click keeps the site menu", async () => {
    await page.evaluate(() => {
      delete document.documentElement.dataset.pageSaw;
      document.getElementById("xmenu").style.display = "none";
    });
    await rightClick("#outer-img", "Shift");
    const state = await page.evaluate(() => ({
      mode: document.documentElement.dataset.xneMenuMode || "",
      pageSaw: document.documentElement.dataset.pageSaw || "",
      siteMenu: document.getElementById("xmenu").style.display,
      labels: (() => {
        const host = document.getElementById("x-native-extension-menu");
        if (!host || host.style.display === "none") return [];
        return [...host.shadowRoot.querySelectorAll("button")]
          .filter((button) => !button.hidden && button.style.display !== "none")
          .map((button) => button.textContent);
      })(),
    }));
    if (state.mode !== "site" || state.pageSaw !== "1" || state.siteMenu !== "block") throw new Error(JSON.stringify(state));
    if (state.labels.length) throw new Error(`our menu stayed open ${state.labels.join("|")}`);
    const siteText = await page.evaluate(() => document.getElementById("xmenu").innerText);
    if (!siteText.includes("Copy photo link") || !siteText.includes("Post Photo")) throw new Error(siteText);
    return state;
  });

  await check("on-page screenshot explains the invocation limit, then Alt+Shift+S saves a PNG", async () => {
    await clearToast();
    await page.evaluate(() => { document.getElementById("xmenu").style.display = "none"; });
    await rightClick("#outer-img");
    await clickMenu("Screenshot post");
    const blocked = await waitToast("blocked the screenshot|Alt\\+Shift\\+S|saved a png");
    const invokedAlready = /saved a png/i.test(blocked);
    const session = await page.createCDPSession();
    await page.bringToFront();
    await session.send("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      modifiers: 9,
      key: "S",
      code: "KeyS",
      windowsVirtualKeyCode: 83,
      nativeVirtualKeyCode: 83,
    });
    await session.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      modifiers: 9,
      key: "S",
      code: "KeyS",
      windowsVirtualKeyCode: 83,
      nativeVirtualKeyCode: 83,
    });
    const saved = await waitToast("saved a png");
    const item = await newestDownload();
    if (!item?.filename?.endsWith(".png")) throw new Error(JSON.stringify(item));
    const bytes = fs.readFileSync(item.filename);
    if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("not a png");
    if (!item.filename.includes("1111111111111111111")) throw new Error(item.filename);
    fs.copyFileSync(item.filename, path.join(artifacts, "repaired-post-screenshot.png"));
    await clearToast();
    await rightClick("#quote-img");
    await clickMenu("Screenshot post");
    const again = await waitToast("saved a png");
    const quoteShot = await newestDownload();
    if (!quoteShot.filename.includes("2222222222222222222")) throw new Error(quoteShot.filename);
    return { blocked, saved, again, outer: item.filename, quote: quoteShot.filename };
  });

  await check("left click still navigates", async () => {
    await page.goto(`${origin}/suppressed`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-xne-ready]");
    await page.click("#nav");
    await page.waitForFunction(() => location.pathname === "/landed");
    const text = await page.evaluate(() => document.body.innerText);
    if (!text.includes("Landed on the profile")) throw new Error(text);
    return text;
  });

  async function expectMenu(selector, labels) {
    await page.evaluate(() => {
      const host = document.getElementById("x-native-extension-menu");
      if (host) host.style.display = "none";
    });
    await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: "center" }), selector);
    await rightClick(selector);
    const seen = await menuLabels();
    assertSame(seen, labels);
    const recorded = await page.evaluate(() => document.documentElement.dataset.xneMenuActions || "");
    assertSame(recorded.split(",").filter(Boolean), labels.map(labelToId));
    return seen;
  }
  function labelToId(label) {
    if (label === "Download full image from post") return "download-image";
    if (label === "Open image in new tab") return "open-image";
    if (label === "Post image") return "post-image";
    if (label === "Download full video from post") return "download-video";
    if (label === "Open video in new tab") return "open-video";
    if (label === "Post video") return "post-video";
    if (label === "Screenshot post") return "screenshot-post";
    throw new Error(`unknown label ${label}`);
  }
  function assertSame(actual, expected) {
    const left = [...actual].sort().join("|");
    const right = [...expected].sort().join("|");
    if (left !== right) throw new Error(`wanted ${right} got ${left}`);
  }

  await page.goto(`${origin}/kinds`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-xne-ready]");
  await check("photo, video, poster, text, quote, and mixed clicks show different actions", async () => {
    const imageActions = ["Download full image from post", "Open image in new tab", "Post image", "Screenshot post"];
    const videoActions = ["Download full video from post", "Open video in new tab", "Post video", "Screenshot post"];
    const photo = await expectMenu("#photo", imageActions);
    await page.screenshot({ path: path.join(artifacts, "menu-photo.png") });
    const video = await expectMenu("#video", videoActions);
    await page.screenshot({ path: path.join(artifacts, "menu-video.png") });
    const play = await expectMenu("#play", videoActions);
    const poster = await expectMenu("#poster", videoActions);
    const text = await expectMenu("#words", ["Screenshot post"]);
    await page.screenshot({ path: path.join(artifacts, "menu-text.png") });
    const avatar = await expectMenu("#avatar", ["Screenshot post"]);
    const mixedBody = await expectMenu("#mixed-text", [
      "Download full image from post",
      "Open image in new tab",
      "Post image",
      "Download full video from post",
      "Open video in new tab",
      "Post video",
      "Screenshot post",
    ]);
    await page.screenshot({ path: path.join(artifacts, "menu-mixed.png") });
    const mixedPhoto = await expectMenu("#mixed-photo", imageActions);
    const quotePhoto = await expectMenu("#quoted-photo", imageActions);
    const outerBody = await expectMenu("#outer-words", ["Screenshot post"]);
    return { photo, video, play, poster, text, avatar, mixedBody, mixedPhoto, quotePhoto, outerBody };
  });

  async function waitForTab(part) {
    const started = Date.now();
    while (Date.now() - started < 5000) {
      const found = await worker.evaluate(async (needle) => {
        const tabs = await chrome.tabs.query({});
        return tabs.map((tab) => tab.url || tab.pendingUrl || "").find((url) => url.includes(needle)) || "";
      }, part);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`no tab containing ${part}`);
  }

  await check("open image uses the full image address, and a blob video opens nothing", async () => {
    await page.goto(`${origin}/kinds`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-xne-ready]");
    const before = await worker.evaluate(async () => (await chrome.tabs.query({})).length);
    await page.evaluate(() => {
      const host = document.getElementById("x-native-extension-menu");
      if (host) host.style.display = "none";
      document.querySelector("#play").scrollIntoView({ block: "center" });
    });
    await rightClick("#play");
    await clickMenu("Open video in new tab");
    const refused = await waitToast("nothing was opened|blob");
    const afterBlob = await worker.evaluate(async () => (await chrome.tabs.query({})).map((tab) => tab.url || ""));
    if (afterBlob.length !== before) throw new Error(afterBlob.join("\n"));
    await page.evaluate(() => {
      const host = document.getElementById("x-native-extension-menu");
      if (host) host.style.display = "none";
      document.querySelector("#photo").scrollIntoView({ block: "center" });
    });
    await rightClick("#photo");
    await clickMenu("Open image in new tab");
    const opened = await waitForTab("/media/PHOTO");
    if (!opened.includes("name=orig")) throw new Error(opened);
    const toast = await waitToast("opened the full image");
    return { refused, opened, toast };
  });

  await check("post image fills an empty composer and does not submit", async () => {
    await page.goto(`${origin}/post-fixture`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-xne-ready]");
    await page.bringToFront();
    await rightClick("#photo");
    await clickMenu("Post image");
    const attachedName = await waitForPage((value) => value.includes(".jpg"), () => document.documentElement.dataset.attached || "");
    const state = await page.evaluate(() => ({
      attached: document.documentElement.dataset.attached || "",
      trusted: document.documentElement.dataset.changeTrusted || "",
      submitted: document.documentElement.dataset.submitted || "",
      text: document.querySelector("[data-testid='tweetTextarea_0']").innerText,
    }));
    if (state.submitted === "1") throw new Error("composer was submitted");
    if (!state.attached.includes("image.jpg")) throw new Error(state.attached || attachedName);
    const toast = await waitToast("nothing was posted");
    return { state, toast };
  });

  await check("an existing draft is left alone and a new composer receives the file", async () => {
    await page.goto(`${origin}/post-draft`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-xne-ready]");
    await rightClick("#photo");
    await clickMenu("Post image");
    await waitToast("new composer");
    const draft = await page.evaluate(() => ({
      text: document.querySelector("[data-testid='tweetTextarea_0']").innerText,
      attached: document.documentElement.dataset.attached || "",
      submitted: document.documentElement.dataset.submitted || "",
    }));
    if (!draft.text.includes("draft in progress")) throw new Error(draft.text);
    if (draft.attached) throw new Error(`draft composer received a file: ${draft.attached}`);
    if (draft.submitted === "1") throw new Error("submitted");
    const composer = await browser.waitForTarget((target) => target.url().includes("/compose-fixture"), { timeout: 8000 });
    const composerPage = await composer.page();
    await composerPage.bringToFront();
    const freshAttached = await waitForPage(
      (value) => value.includes(".jpg"),
      () => document.documentElement.dataset.attached || "",
      composerPage,
    );
    if (!freshAttached.includes(".jpg")) throw new Error(freshAttached);
    const fresh = await composerPage.evaluate(() => ({
      attached: document.documentElement.dataset.attached || "",
      submitted: document.documentElement.dataset.submitted || "",
      text: document.querySelector("[data-testid='tweetTextarea_0']").textContent,
    }));
    if (fresh.submitted === "1") throw new Error("new composer was submitted");
    if (fresh.text.trim()) throw new Error(`new composer was not empty: ${fresh.text}`);
    return { draft, fresh };
  });
} finally {
  await browser.close();
  server.close();
}

fs.mkdirSync(artifacts, { recursive: true });
const out = {
  chrome: executablePath,
  passed: results.filter((item) => item.pass).length,
  failed: results.filter((item) => !item.pass).length,
  results,
};
fs.writeFileSync(path.join(artifacts, "browser-test-results.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ passed: out.passed, failed: out.failed }, null, 2));
if (out.failed) process.exit(1);
