import { MAX_PASTE_CHARS } from "./settings.js";

/**
 * Decide what to do with one paste attempt.
 * The paste event itself does not carry shiftKey in current Chromium
 * (ClipboardEvent extends Event), so the caller tracks Shift from keydown.
 *
 * @param {{
 *   enabled: boolean,
 *   armed: boolean,
 *   shiftHeld: boolean,
 *   composer: boolean,
 *   plainText: string,
 *   hasFiles: boolean,
 * }} input
 * @returns {{
 *   action: "ignore" | "allow-native" | "rewrite",
 *   reason: string,
 *   consumeArm?: boolean,
 *   text?: string,
 *   toast?: string,
 * }}
 */
export function decidePaste(input) {
  if (!input.composer) return { action: "ignore", reason: "not-composer" };
  if (!input.enabled) return { action: "ignore", reason: "disabled" };
  if (input.armed) {
    return {
      action: "allow-native",
      reason: "armed",
      consumeArm: true,
      toast: "This paste used the browser's normal paste.",
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
      toast: "That paste is very long, so the browser's normal paste was used.",
    };
  }
  return { action: "rewrite", reason: "plain-text", text };
}
