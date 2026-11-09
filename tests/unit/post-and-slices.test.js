import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseHTML } from "linkedom";
import {
  collectPostImages,
  findComposerEditable,
  findPostRoot,
  findStatusId,
  findTargetedImage,
  findTargetVideo,
} from "../../src/lib/post-dom.js";
import { imageCandidateUrls } from "../../src/lib/image-url.js";
import { planVerticalSlices } from "../../src/lib/screenshot-plan.js";

const html = readFileSync(new URL("../fixtures/timeline.html", import.meta.url), "utf8");
const { document } = parseHTML(html);

test("right-click targets the innermost post, quote, and photo", () => {
  const quoteImg = document.querySelector("#quote-img");
  const quote = findPostRoot(quoteImg);
  assert.equal(quote.id, "quote");
  assert.equal(findTargetedImage(quoteImg, quote).id, "quote-img");
  assert.equal(findStatusId(quote), "2222222222222222222");
  assert.deepEqual(imageCandidateUrls(quoteImg.getAttribute("src"))[0], "https://pbs.twimg.com/media/QUOTE?format=jpg&name=orig");

  const outerImg = document.querySelector("#outer-a");
  const outer = findPostRoot(outerImg);
  assert.equal(outer.id, "outer");
  assert.equal(findStatusId(outer), "1111111111111111111");
  const all = collectPostImages(outer).map((img) => img.id);
  assert.deepEqual(all, ["outer-a", "outer-b"]);
  assert.equal(findTargetedImage(document.querySelector("#outer a"), outer), null);
  assert.equal(findTargetVideo(document.querySelector("#blob-video"), quote).video.id, "blob-video");
  assert.equal(findTargetVideo(document.querySelector("#outer a"), outer).reason, "none");
  assert.equal(findTargetVideo(document.querySelector("#many-text"), document.querySelector("#many")).reason, "many");
  assert.equal(findTargetVideo(document.querySelector("#direct-video"), document.querySelector("#direct")).reason, "targeted");
});

test("composers include reply and nested editors, and exclude search", () => {
  assert.equal(findComposerEditable(document.querySelector("#nested-editor")).id, "nested-editor");
  assert.equal(findComposerEditable(document.querySelector("#reply")).id, "reply");
  assert.equal(findComposerEditable(document.querySelector("#search")), null);
  const password = document.createElement("input");
  password.setAttribute("type", "password");
  password.setAttribute("aria-label", "Post text");
  document.body.appendChild(password);
  assert.equal(findComposerEditable(password), null);
});

test("a plain article and data-href still identify the inner post", () => {
  const { document: live } = parseHTML(`
    <div role="link" data-href="/X/status/2118833672539553808">
      <article id="outer">
        <div role="link" data-href="/Starlink/status/2118831607650136119" data-slot="embedded-tweet-frame">
          <article id="inner"><video id="quoted-video"></video></article>
        </div>
      </article>
    </div>
  `);
  const video = live.querySelector("#quoted-video");
  const post = findPostRoot(video);
  assert.equal(post.id, "inner");
  assert.equal(findStatusId(post), "2118831607650136119");
  assert.equal(findStatusId(live.querySelector("#outer")), "2118833672539553808");
});

test("screenshot slices cover a tall post without gaps", () => {
  const plan = planVerticalSlices({
    postTop: 100,
    postHeight: 2500,
    postLeft: 20,
    postWidth: 500,
    viewportWidth: 1000,
    viewportHeight: 800,
    obstructionTop: 40,
    obstructionBottom: 0,
    maxSlices: 10,
  });
  assert.equal(plan.truncated, false);
  assert.equal(plan.covered, 2500);
  for (let i = 1; i < plan.slices.length; i++) {
    assert.equal(plan.slices[i].docTop, plan.slices[i - 1].docBottom);
  }
  assert.equal(plan.slices[0].docTop, 100);
  assert.equal(plan.slices.at(-1).docBottom, 2600);

  const clipped = planVerticalSlices({
    postTop: 0,
    postHeight: 4000,
    postLeft: -10,
    postWidth: 3000,
    viewportWidth: 800,
    viewportHeight: 600,
    maxSlices: 2,
    maxCssHeight: 1000,
  });
  assert.equal(clipped.truncated, true);
  assert.equal(clipped.widthClipped, true);
  assert.ok(clipped.covered < 4000);
});
