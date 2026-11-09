import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";
import { menuActionIds } from "../../src/lib/context-menu-policy.js";
import { classifyMediaTarget, collectPostImages, findPostRoot, postHasVideo } from "../../src/lib/post-dom.js";

test("a photo click is not a video click, and a poster is not a photo", () => {
  assert.deepEqual(menuActionIds({ targetKind: "photo", hasPhoto: true, hasVideo: true }), [
    "download-image",
    "open-image",
    "post-image",
    "screenshot-post",
  ]);
  assert.deepEqual(menuActionIds({ targetKind: "video", hasPhoto: true, hasVideo: true }), [
    "download-video",
    "open-video",
    "post-video",
    "screenshot-post",
  ]);
  assert.deepEqual(menuActionIds({ targetKind: "body", hasPhoto: false, hasVideo: false }), ["screenshot-post"]);
  assert.deepEqual(menuActionIds({ targetKind: "body", hasPhoto: true, hasVideo: true }), [
    "download-image",
    "open-image",
    "post-image",
    "download-video",
    "open-video",
    "post-video",
    "screenshot-post",
  ]);
});

test("quoted media and avatars do not leak into the post under the pointer", () => {
  const { document } = parseHTML(`
    <article id="outer">
      <img id="avatar" src="https://pbs.twimg.com/profile_images/1/a_normal.jpg" alt="">
      <img id="emoji" src="https://abs.twimg.com/emoji/v2/svg/1f600.svg" alt="">
      <p id="text">hello</p>
      <img id="photo" src="https://pbs.twimg.com/media/PHOTO?format=jpg&name=small" alt="">
      <div data-testid="videoPlayer">
        <img id="poster" src="https://pbs.twimg.com/amplify_video_thumb/99/img/abc.jpg" alt="">
        <button id="play" aria-label="Play"></button>
        <video id="video" src="blob:https://x.com/x"></video>
      </div>
      <div data-testid="quoteTweet">
        <img id="quote-photo" src="https://pbs.twimg.com/media/QUOTE?format=jpg&name=small" alt="">
      </div>
    </article>
    <article id="words"><p id="only-text">just words</p><img id="only-avatar" src="https://pbs.twimg.com/profile_images/2/b.jpg"></article>
    <article id="lazy">
      <div data-testid="videoPlayer"><img id="lazy-poster" src="https://pbs.twimg.com/ext_tw_video_thumb/5/img/a.jpg" alt=""></div>
    </article>
  `);
  const outer = document.querySelector("#outer");
  assert.deepEqual(collectPostImages(outer).map((img) => img.id), ["photo"]);
  assert.equal(postHasVideo(outer), true);
  assert.equal(classifyMediaTarget(document.querySelector("#photo"), outer), "photo");
  assert.equal(classifyMediaTarget(document.querySelector("#poster"), outer), "video");
  assert.equal(classifyMediaTarget(document.querySelector("#play"), outer), "video");
  assert.equal(classifyMediaTarget(document.querySelector("#video"), outer), "video");
  assert.equal(classifyMediaTarget(document.querySelector("#avatar"), outer), "body");
  assert.equal(classifyMediaTarget(document.querySelector("#emoji"), outer), "body");
  assert.equal(classifyMediaTarget(document.querySelector("#text"), outer), "body");

  const quote = findPostRoot(document.querySelector("#quote-photo"));
  assert.equal(quote.getAttribute("data-testid"), "quoteTweet");
  assert.deepEqual(collectPostImages(quote).map((img) => img.id), ["quote-photo"]);
  assert.equal(postHasVideo(quote), false);

  const words = document.querySelector("#words");
  assert.equal(collectPostImages(words).length, 0);
  assert.equal(postHasVideo(words), false);
  assert.equal(classifyMediaTarget(document.querySelector("#only-avatar"), words), "body");

  const lazy = document.querySelector("#lazy");
  assert.equal(classifyMediaTarget(document.querySelector("#lazy-poster"), lazy), "video");
  assert.equal(postHasVideo(lazy), true);
  assert.equal(collectPostImages(lazy).length, 0);
});
