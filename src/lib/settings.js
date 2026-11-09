export const SETTINGS_DEFAULTS = {
  pasteAsTyped: true,
};

export const SESSION_KEY = "x-native-extension-paste";

export const MAX_PASTE_CHARS = 100_000;

/**
 * @param {Storage | { getItem: (key: string) => string | null } | null | undefined} storage
 * @returns {boolean | null}
 */
export function readSessionPasteEnabled(storage) {
  if (!storage) return null;
  try {
    const value = storage.getItem(SESSION_KEY);
    if (value === "0") return false;
    if (value === "1") return true;
  } catch {
    return null;
  }
  return null;
}

/**
 * @param {Storage | { setItem: (key: string, value: string) => void } | null | undefined} storage
 * @param {boolean} enabled
 */
export function writeSessionPasteEnabled(storage, enabled) {
  if (!storage) return;
  try {
    storage.setItem(SESSION_KEY, enabled ? "1" : "0");
  } catch {
    /* private mode or disabled storage */
  }
}
