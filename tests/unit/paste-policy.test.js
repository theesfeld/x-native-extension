import assert from "node:assert/strict";
import test from "node:test";
import { decidePaste } from "../../src/lib/paste-policy.js";
import { MAX_PASTE_CHARS } from "../../src/lib/settings.js";

const base = {
  enabled: true,
  armed: false,
  shiftHeld: false,
  composer: true,
  plainText: "Café 🎉\nnext",
  hasFiles: false,
};

test("plain text in a composer is rewritten", () => {
  const decision = decidePaste(base);
  assert.equal(decision.action, "rewrite");
  assert.equal(decision.text, base.plainText);
});

test("search fields, files, and an empty clipboard are not rewritten", () => {
  assert.equal(decidePaste({ ...base, composer: false }).reason, "not-composer");
  assert.equal(decidePaste({ ...base, hasFiles: true }).reason, "files");
  assert.equal(decidePaste({ ...base, plainText: "" }).reason, "no-text");
});

test("shift, the one-shot arm, the off switch, and huge pastes stay native", () => {
  assert.equal(decidePaste({ ...base, shiftHeld: true }).action, "allow-native");
  const armed = decidePaste({ ...base, armed: true });
  assert.equal(armed.action, "allow-native");
  assert.equal(armed.consumeArm, true);
  assert.equal(decidePaste({ ...base, enabled: false }).action, "ignore");
  const huge = decidePaste({ ...base, plainText: "a".repeat(MAX_PASTE_CHARS + 1) });
  assert.equal(huge.reason, "too-long");
  assert.match(huge.toast, /normal paste/);
});
