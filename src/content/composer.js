import { PRODUCTION_COMPOSER_URL } from "../lib/messages.js";

const FILE_INPUT = "input[type='file']";

/**
 * @param {Document} doc
 */
export function findFileInputs(doc) {
  return [...doc.querySelectorAll(FILE_INPUT)].filter((input) => {
    const accept = (input.getAttribute("accept") || "").toLowerCase();
    const testid = input.getAttribute("data-testid") || "";
    return testid === "fileInput" || accept.includes("image") || accept.includes("video") || accept === "";
  });
}

/** @param {Element} input */
export function composerShell(input) {
  return input.closest("[role='dialog'], form, [data-testid='toolBar']") || input.parentElement || input;
}

/** @param {Element | null | undefined} shell */
export function shellHasDraft(shell) {
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

/** @param {Document} doc */
export function pageHasDraft(doc) {
  return findFileInputs(doc).some((input) => shellHasDraft(composerShell(input)));
}

/** @param {Document} doc */
export function findEmptyComposerInput(doc) {
  return findFileInputs(doc).find((input) => !shellHasDraft(composerShell(input))) || null;
}

/**
 * Put files on the composer's picker and notify listeners the way a chosen
 * file does. Does not click Post, Reply, or any submit control.
 * @param {HTMLInputElement} input
 * @param {File[]} files
 */
export function attachFiles(input, files) {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  input.files = transfer.files;
  const change = new Event("change", { bubbles: true });
  input.dispatchEvent(change);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return {
    count: input.files?.length || 0,
    names: [...(input.files || [])].map((file) => file.name),
    changeTrusted: change.isTrusted,
  };
}

/** @param {string} href */
export function isComposerPage(href) {
  try {
    const url = new URL(href);
    if (url.origin === "https://x.com" && url.pathname === "/compose/post") return true;
    if ((url.hostname === "127.0.0.1" || url.hostname === "localhost") && url.pathname === "/compose-fixture") return true;
  } catch {
    return false;
  }
  return false;
}

export { PRODUCTION_COMPOSER_URL };
