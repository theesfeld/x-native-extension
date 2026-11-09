import { UserVisibleError } from "./errors.js";

/**
 * @param {string} name
 */
export function sanitizeFilename(name) {
  const cleaned = String(name)
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\.\.+/g, ".")
    .replace(/^\.+/, "")
    .replace(/\s+/g, "-")
    .slice(0, 120);
  if (!cleaned || cleaned === ".") return "x-download";
  return cleaned;
}

/**
 * @param {string | null | undefined} statusId
 * @param {"image" | "video" | "screenshot"} kind
 * @param {number} index 0 omits the index; 1-based otherwise
 */
export function filenameBaseForStatus(statusId, kind, index = 0) {
  const id = typeof statusId === "string" && /^\d{5,22}$/.test(statusId) ? `status-${statusId}` : "post";
  const suffix = index > 0 ? `-${index}` : "";
  const base = sanitizeFilename(`x-${id}-${kind}${suffix}`).toLowerCase();
  if (!/^x-[a-z0-9-]+$/.test(base)) {
    throw new UserVisibleError("Could not build a safe filename.", "bad-filename");
  }
  return base;
}

/**
 * @param {string} filename basename only, already including the extension
 */
export function assertDownloadFilename(filename) {
  if (typeof filename !== "string") {
    throw new UserVisibleError("Could not build a safe filename.", "bad-filename");
  }
  if (filename.length > 140 || /[\\/]/.test(filename) || filename.includes("..")) {
    throw new UserVisibleError("Could not build a safe filename.", "bad-filename");
  }
  if (!/^x-[a-z0-9.-]+$/i.test(filename)) {
    throw new UserVisibleError("Could not build a safe filename.", "bad-filename");
  }
  return filename;
}

/**
 * @param {string} base
 */
export function assertFilenameBase(base) {
  if (typeof base !== "string" || base.length > 100 || !/^x-[a-z0-9-]+$/i.test(base)) {
    throw new UserVisibleError("Could not build a safe filename.", "bad-filename");
  }
  return base;
}
