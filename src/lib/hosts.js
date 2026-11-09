import { UserVisibleError } from "./errors.js";

/** Production page hosts. Local fixture pages are allowed only when this copy's manifest already grants them. */
export const PRODUCTION_PAGE_HOSTS = ["x.com", "twitter.com"];

export const IMAGE_HOSTS = ["pbs.twimg.com"];
export const VIDEO_HOSTS = ["video.twimg.com"];

/**
 * @param {string} value
 * @param {{ host_permissions?: string[] } | null | undefined} manifest
 */
export function isAllowedPageUrl(value, manifest) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (url.protocol === "https:" && PRODUCTION_PAGE_HOSTS.includes(url.hostname)) return true;
  if (
    url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
    manifestGrantsLocalFixtures(manifest)
  ) {
    return true;
  }
  return false;
}

/**
 * Test builds add http://127.0.0.1/* to host_permissions so fixture pages can
 * exercise the real content script. The packaged manifest does not, so this
 * stays closed for a normal install.
 * @param {{ host_permissions?: string[] } | null | undefined} manifest
 */
export function manifestGrantsLocalFixtures(manifest) {
  const perms = manifest?.host_permissions || [];
  return perms.includes("http://127.0.0.1/*") || perms.includes("http://localhost/*");
}

/**
 * @param {string} value
 * @param {string[]} hosts
 */
/**
 * Production always uses X's compose page. A fixture URL is accepted only when
 * this copy's manifest already grants local pages, and only for that exact path.
 * @param {string | null | undefined} requested
 * @param {{ host_permissions?: string[] } | null | undefined} manifest
 */
export function resolveComposerUrl(requested, manifest) {
  const production = "https://x.com/compose/post";
  if (!requested || !manifestGrantsLocalFixtures(manifest)) return production;
  let url;
  try {
    url = new URL(requested);
  } catch {
    return production;
  }
  if (url.protocol !== "http:" || (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")) return production;
  if (url.pathname !== "/compose-fixture") return production;
  return `${url.origin}/compose-fixture`;
}

export function imageHostsForManifest(manifest) {
  const hosts = [...IMAGE_HOSTS];
  if (manifestGrantsLocalFixtures(manifest)) hosts.push("127.0.0.1", "localhost");
  return hosts;
}

export function assertMediaUrl(value, hosts) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new UserVisibleError("The media address was not a valid URL.", "bad-url");
  }
  const localFixture = (url.hostname === "127.0.0.1" || url.hostname === "localhost") && hosts.includes(url.hostname);
  if (url.protocol !== "https:" && !(localFixture && url.protocol === "http:")) {
    throw new UserVisibleError("Only HTTPS media addresses can be downloaded.", "bad-url");
  }
  if (url.username || url.password) {
    throw new UserVisibleError("Media addresses that contain a password are blocked.", "bad-url");
  }
  if (!hosts.includes(url.hostname)) {
    throw new UserVisibleError(
      "That file is on a host this extension does not download from.",
      "bad-host",
    );
  }
  return url;
}
