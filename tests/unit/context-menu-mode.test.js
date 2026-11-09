import assert from "node:assert/strict";
import test from "node:test";
import { captureNeedsInvocation, contextMenuMode } from "../../src/lib/context-menu-policy.js";
import { imageCandidateUrls, toOriginalImageUrl } from "../../src/lib/image-url.js";
import { assertMediaUrl } from "../../src/lib/hosts.js";

test("a post right-click is ours, shift stays with the site, alt keeps the browser menu", () => {
  assert.equal(contextMenuMode({ hasPost: true }), "extension");
  assert.equal(contextMenuMode({ hasPost: true, shiftKey: true, altKey: true }), "site");
  assert.equal(contextMenuMode({ hasPost: true, altKey: true }), "browser");
  assert.equal(contextMenuMode({ hasPost: false, shiftKey: true }), "ignore");
});

test("page-button capture errors are invocation errors, not a reason to widen permissions", () => {
  assert.equal(captureNeedsInvocation("Error: Either the '<all_urls>' or 'activeTab' permission is required."), true);
  assert.equal(captureNeedsInvocation("The media request failed (404)."), false);
});

test("fixture image hosts are rewritten only when the caller allows them", () => {
  const small = "http://127.0.0.1:8765/media/QUOTE?format=jpg&name=small";
  assert.equal(toOriginalImageUrl(small), null);
  assert.equal(
    toOriginalImageUrl(small, { allowLocal: true }),
    "http://127.0.0.1:8765/media/QUOTE?format=jpg&name=orig",
  );
  assert.equal(imageCandidateUrls(small).length, 0);
  const urls = imageCandidateUrls(small, { allowLocal: true });
  assert.equal(urls[0], "http://127.0.0.1:8765/media/QUOTE?format=jpg&name=orig");
  assert.equal(assertMediaUrl(urls[0], ["127.0.0.1"]).hostname, "127.0.0.1");
  assert.throws(() => assertMediaUrl(urls[0], ["pbs.twimg.com"]));
});
