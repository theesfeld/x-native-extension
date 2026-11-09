import { elementFromEvent, findComposerEditable } from "../lib/post-dom.js";
import { decidePaste } from "../lib/paste-policy.js";
import { readSessionPasteEnabled, SETTINGS_DEFAULTS, writeSessionPasteEnabled } from "../lib/settings.js";

/**
 * Intercept plain-text paste in post composers and insert with execCommand('insertText').
 * Measured on Chrome 156/157: that command fires trusted input events (inputType insertText),
 * does not fire beforeinput, and does not deliver a paste event when the paste was cancelled.
 * It is not a synthetic keystroke stream, and it is not claimed to be indistinguishable from typing.
 *
 * @param {{ showToast: (message: string) => void }} deps
 */
export function installPaste(deps) {
  let enabled = readSessionPasteEnabled(sessionStorage()) ?? SETTINGS_DEFAULTS.pasteAsTyped;
  let armed = false;
  let shiftHeld = false;
  let handlingPaste = false;

  chrome.storage.local.get(SETTINGS_DEFAULTS).then((stored) => {
    enabled = stored.pasteAsTyped !== false;
    writeSessionPasteEnabled(sessionStorage(), enabled);
  }).catch(() => {});

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
      armed = true;
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
      armed,
      shiftHeld,
      composer: Boolean(findComposerEditable(elementFromEvent(event))),
      plainText: readPlainText(event),
      hasFiles: clipboardHasFiles(event),
    });
    mark(`paste:${decision.action}:${decision.reason}`);
    if (decision.consumeArm) armed = false;
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
        "The browser refused the insert-text command, so nothing was inserted. Hold Shift and paste for a normal paste, or turn rewrite off.",
      );
      mark("paste:failed");
      return;
    }
    mark(`rewrite:${decision.text.length}`);
  }, true);

  document.addEventListener("beforeinput", (event) => {
    if (handlingPaste) return;
    if (event.inputType !== "insertFromPaste" || !event.cancelable) return;
    const editable = findComposerEditable(elementFromEvent(event));
    if (!editable) return;
    const decision = decidePaste({
      enabled,
      armed,
      shiftHeld,
      composer: true,
      plainText: typeof event.data === "string" ? event.data : "",
      hasFiles: false,
    });
    if (decision.action !== "rewrite" || !decision.text) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const result = insertAsTypedText(editable, decision.text);
    if (!result.ok) {
      deps.showToast(
        "The browser refused the insert-text command, so nothing was inserted. Hold Shift and paste for a normal paste, or turn rewrite off.",
      );
    } else {
      mark(`rewrite:${decision.text.length}`);
    }
  }, true);
}

/**
 * @param {HTMLElement} editable
 * @param {string} text
 */
export function insertAsTypedText(editable, text) {
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

/** @param {HTMLElement} editable */
function saveSelection(editable) {
  const tag = editable.tagName;
  if (tag === "TEXTAREA" || tag === "INPUT") {
    const field = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (editable);
    return { kind: "input", start: field.selectionStart ?? field.value.length, end: field.selectionEnd ?? field.value.length };
  }
  const view = editable.ownerDocument.defaultView;
  const selection = view?.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!editable.contains(range.commonAncestorContainer)) return null;
  return { kind: "range", range: range.cloneRange() };
}

/**
 * @param {HTMLElement} editable
 * @param {ReturnType<typeof saveSelection>} saved
 */
function restoreSelection(editable, saved) {
  if (!saved) return;
  if (saved.kind === "input") {
    const field = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (editable);
    try {
      field.setSelectionRange(saved.start, saved.end);
    } catch {
      /* some input types reject selection */
    }
    return;
  }
  const view = editable.ownerDocument.defaultView;
  const selection = view?.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(saved.range);
}

/** @param {HTMLElement} editable */
function readEditable(editable) {
  if (editable.tagName === "TEXTAREA" || editable.tagName === "INPUT") {
    return /** @type {HTMLInputElement | HTMLTextAreaElement} */ (editable).value;
  }
  return editable.innerText ?? editable.textContent ?? "";
}

/** @param {ClipboardEvent} event */
function readPlainText(event) {
  try {
    return event.clipboardData?.getData("text/plain") || "";
  } catch {
    return "";
  }
}

/** @param {ClipboardEvent} event */
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

/** @param {string} status */
function mark(status) {
  const root = document.documentElement;
  if (root) root.dataset.xneLast = status;
}
