/**
 * X cancels the browser context menu and draws its own. Extension items live
 * in that browser menu, so they never appear unless the page is kept from
 * cancelling it.
 *
 * - extension: normal right-click on a post. Stop the page menu and show ours.
 * - browser: Alt+right-click. Stop the page menu, leave the browser menu
 *   (Save image, Copy, and this extension's items). Choosing Screenshot post
 *   there grants activeTab.
 * - site: Shift+right-click. Leave X's menu (Copy photo link, Post Photo) alone.
 * - ignore: the click is not on a post.
 *
 * @param {{ shiftKey?: boolean, altKey?: boolean, hasPost?: boolean }} input
 * @returns {"ignore" | "site" | "browser" | "extension"}
 */
export function contextMenuMode(input) {
  if (!input.hasPost) return "ignore";
  if (input.shiftKey) return "site";
  if (input.altKey) return "browser";
  return "extension";
}

/**
 * captureVisibleTab rejects a click on a page-injected control. Chrome only
 * allows the capture after an extension invocation: its menu item, a command,
 * or the toolbar action. Host permission for x.com is not enough, and this
 * must not be widened to every site.
 * @param {string} message
 */
/**
 * Which actions belong on this right-click.
 * A photo or video target only offers that download. A body click offers each
 * kind of media that belongs to this post, which can be both on a mixed post.
 * Screenshot stays in every case. Quoted media must already be excluded from
 * the booleans.
 * @param {{ targetKind?: "photo" | "video" | "body", hasPhoto?: boolean, hasVideo?: boolean }} input
 * @returns {string[]}
 */
export function menuActionIds(input) {
  const kind = input.targetKind || "body";
  /** @type {string[]} */
  const ids = [];
  if (kind === "photo" || (kind === "body" && input.hasPhoto)) {
    ids.push("download-image", "open-image", "post-image");
  }
  if (kind === "video" || (kind === "body" && input.hasVideo)) {
    ids.push("download-video", "open-video", "post-video");
  }
  ids.push("screenshot-post");
  return ids;
}

export function captureNeedsInvocation(message) {
  return /activeTab|<all_urls>|all_urls/i.test(String(message || ""));
}
