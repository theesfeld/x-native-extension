import assert from "node:assert/strict";
import test from "node:test";
import { imageCandidateUrls, toOriginalImageUrl } from "../../src/lib/image-url.js";
import { assertDownloadFilename, filenameBaseForStatus, sanitizeFilename } from "../../src/lib/filename.js";
import { assertMediaUrl, isAllowedPageUrl } from "../../src/lib/hosts.js";
import { decodeBase64, encodeBase64, MENU_ITEMS, parseContextAction, parseDownloadImage, parseDownloadPng } from "../../src/lib/messages.js";
import { readFileSync } from "node:fs";

test("post photos are rewritten to the public orig variant", () => {
  assert.equal(
    toOriginalImageUrl("https://pbs.twimg.com/media/AbCdEf?format=jpg&name=small"),
    "https://pbs.twimg.com/media/AbCdEf?format=jpg&name=orig",
  );
  assert.equal(
    toOriginalImageUrl("https://pbs.twimg.com/media/AbCdEf.png?name=medium"),
    "https://pbs.twimg.com/media/AbCdEf?format=png&name=orig",
  );
  assert.equal(
    toOriginalImageUrl("https://pbs.twimg.com/media/AbCdEf.jpg:large"),
    "https://pbs.twimg.com/media/AbCdEf?format=jpg&name=orig",
  );
  const candidates = imageCandidateUrls("https://pbs.twimg.com/media/AbCdEf?format=jpg&name=small");
  assert.equal(candidates[0], "https://pbs.twimg.com/media/AbCdEf?format=jpg&name=orig");
  assert.ok(candidates.includes("https://pbs.twimg.com/media/AbCdEf?format=jpg&name=large"));
  assert.ok(candidates.includes("https://pbs.twimg.com/media/AbCdEf?format=jpg&name=small"));
});

test("non-photos and unsafe addresses are not image candidates", () => {
  assert.equal(toOriginalImageUrl("https://pbs.twimg.com/profile_images/999/abc_normal.jpg"), null);
  assert.equal(toOriginalImageUrl("http://pbs.twimg.com/media/AbCdEf.jpg"), null);
  assert.equal(toOriginalImageUrl("https://evil.example/media/AbCdEf.jpg"), null);
  assert.equal(toOriginalImageUrl("javascript:alert(1)"), null);
  assert.equal(toOriginalImageUrl("https://user:pass@pbs.twimg.com/media/AbCdEf.jpg"), null);
});

test("filenames cannot carry a path", () => {
  assert.equal(filenameBaseForStatus("1111111111111111111", "image", 2), "x-status-1111111111111111111-image-2");
  assert.equal(filenameBaseForStatus("../etc/passwd", "video", 0), "x-post-video");
  assert.equal(sanitizeFilename("a/../../b?.png"), "a-.-.-b-.png");
  assert.throws(() => assertDownloadFilename("../x-file.png"));
  assert.throws(() => assertDownloadFilename("x-file/png"));
  assert.equal(assertDownloadFilename("x-status-1-image.jpg"), "x-status-1-image.jpg");
});

test("messages accept only known actions and media hosts", () => {
  assert.deepEqual(
    MENU_ITEMS.map((item) => item.title),
    [
      "Download full image from post",
      "Open image in new tab",
      "Post image",
      "Download full video from post",
      "Open video in new tab",
      "Post video",
      "Screenshot post",
    ],
  );
  assert.equal(parseContextAction({ type: "context-action", action: "download-image" })?.action, "download-image");
  assert.equal(parseContextAction({ type: "context-action", action: "eval" }), null);
  assert.throws(() =>
    parseDownloadImage({
      type: "download-image",
      filenameBase: "x-post-image",
      urls: ["javascript:alert(1)"],
    }),
  );
  assert.throws(() =>
    parseDownloadImage({
      type: "download-image",
      filenameBase: "x-post-image",
      urls: ["https://evil.example/a.jpg"],
    }),
  );
  assert.throws(() =>
    parseDownloadImage({
      type: "download-image",
      filenameBase: "../x-post-image",
      urls: ["https://pbs.twimg.com/media/A?format=jpg&name=orig"],
    }),
  );
  const header = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const png = parseDownloadPng({
    type: "download-png",
    filenameBase: "x-post-screenshot",
    base64: encodeBase64(header),
  });
  assert.deepEqual([...png.bytes], [...header]);
  assert.deepEqual([...decodeBase64(encodeBase64(header))], [...header]);
  assert.throws(() => parseDownloadPng({ type: "download-png", filenameBase: "x-post-screenshot", bytes: [1, 2] }));
});

test("page URLs stay on x.com unless this copy's manifest grants local fixtures", () => {
  const production = { host_permissions: ["https://x.com/*", "https://twitter.com/*"] };
  assert.equal(isAllowedPageUrl("https://x.com/home", production), true);
  assert.equal(isAllowedPageUrl("https://twitter.com/home", production), true);
  assert.equal(isAllowedPageUrl("http://127.0.0.1:8765/composer", production), false);
  assert.equal(isAllowedPageUrl("https://example.com/", production), false);
  assert.equal(
    isAllowedPageUrl("http://127.0.0.1:8765/composer", { host_permissions: ["http://127.0.0.1/*"] }),
    true,
  );
  assert.throws(() => assertMediaUrl("https://video.twimg.com.evil.example/a.mp4", ["video.twimg.com"]));
});

test("packaged manifest permissions stay minimal", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../src/manifest.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.permissions, ["contextMenus", "downloads", "storage", "activeTab"]);
  assert.deepEqual(manifest.host_permissions, [
    "https://x.com/*",
    "https://twitter.com/*",
    "https://pbs.twimg.com/*",
    "https://video.twimg.com/*",
  ]);
  assert.equal(manifest.content_scripts[0].matches.includes("http://127.0.0.1/*"), false);
  assert.equal(JSON.stringify(manifest).includes("eval"), false);
});
