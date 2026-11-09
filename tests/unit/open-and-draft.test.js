import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";
import { resolveOpenableVideoUrl } from "../../src/lib/download-media.js";
import { resolveComposerUrl } from "../../src/lib/hosts.js";
import { pageHasDraft, shellHasDraft } from "../../src/content/composer.js";

test("composer URLs stay on the real compose page unless this copy allows a fixture", () => {
  const local = { host_permissions: ["http://127.0.0.1/*"] };
  const production = { host_permissions: ["https://x.com/*"] };
  assert.equal(resolveComposerUrl("", production), "https://x.com/compose/post");
  assert.equal(resolveComposerUrl("http://127.0.0.1:9/compose-fixture", production), "https://x.com/compose/post");
  assert.equal(resolveComposerUrl("https://evil.example/compose-fixture", local), "https://x.com/compose/post");
  assert.equal(resolveComposerUrl("http://127.0.0.1:9/compose-fixture", local), "http://127.0.0.1:9/compose-fixture");
});

test("a typed composer is a draft and an empty one is not", () => {
  const { document } = parseHTML(`<form id="draft">
    <div contenteditable="true">draft in progress</div>
    <input type="file" data-testid="fileInput">
  </form>
  <form id="empty">
    <div contenteditable="true"></div>
    <input type="file" data-testid="fileInput">
  </form>`);
  assert.equal(shellHasDraft(document.querySelector("#draft")), true);
  assert.equal(shellHasDraft(document.querySelector("#empty")), false);
  assert.equal(pageHasDraft(document), true);
});

test("a direct mp4 can be opened and a segmented playlist cannot", async () => {
  const mp4 = "https://video.twimg.com/ext_tw_video/1700000000000000001/pu/vid/1280x720/clip.mp4";
  assert.equal(await resolveOpenableVideoUrl([mp4, "blob:https://x.com/nope"]), mp4);
  const playlist = "https://video.twimg.com/ext_tw_video/1700000000000000001/pl/index.m3u8";
  await assert.rejects(
    () =>
      resolveOpenableVideoUrl([playlist], {
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          url: playlist,
          arrayBuffer: async () => new TextEncoder().encode("#EXTM3U\n#EXTINF:1,\na.ts\n#EXTINF:1,\nb.ts\n").buffer,
        }),
      }),
    /Nothing was opened/,
  );
});
